/**
 * Luna — the paid MASTER ORCHESTRATOR lane.
 *
 * Luna is deliberately outside the worker provider chain in `config.ts`. It is
 * never selectable for a worker role (`primary`, `design`, `fast`, `vision`,
 * `coding`, `image`, `transcription`): those stay free-first forever. Luna only
 * ever does coordination work — understanding a request, holding design intent,
 * approving a plan and reviewing a result — and every call is:
 *
 *  1. gated on `OPENAI_API_KEY` existing,
 *  2. gated on a durable monthly spend cap enforced in our own database
 *     (default $20/month; OpenAI is never trusted to enforce it),
 *  3. non-blocking — any failure returns a reason and the builder continues on
 *     the deterministic engine plus the free model pool.
 *
 * Server-only. The key is read inside functions, never at module scope, and is
 * never returned to a caller.
 */

/** Microcents: one hundred-millionth of a dollar. $20 => 2_000_000_000. */
export const MICROCENTS_PER_DOLLAR = 100_000_000;
export const DEFAULT_MONTHLY_CAP_MICROCENTS = 20 * MICROCENTS_PER_DOLLAR;

/** The paid orchestrator model. Overridable without a deploy. */
export const DEFAULT_LUNA_MODEL = "gpt-5.6-luna";

export type LunaPurpose =
  | "intent"
  | "plan_review"
  | "design_direction"
  | "visual_review"
  | "repair_review";

export type LunaSkipReason =
  | "no_key"
  | "disabled"
  | "budget_exhausted"
  | "unauthorized"
  | "rate_limited"
  | "provider_unavailable"
  | "bad_response"
  | "ledger_unavailable";

export type LunaResult =
  | { ok: true; text: string; model: string; costMicrocents: number }
  | { ok: false; reason: LunaSkipReason; detail: string | null };

function env(name: string): string | null {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function dollarsEnv(name: string, fallback: number): number {
  const raw = env(name);
  const parsed = raw === null ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Luna is on unless an operator explicitly turns it off. */
export function lunaEnabled(): boolean {
  const raw = (env("LUNA_ENABLED") ?? "").toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off" || raw === "no") return false;
  return Boolean(env("OPENAI_API_KEY"));
}

export function lunaModel(): string {
  return env("LUNA_MODEL") ?? DEFAULT_LUNA_MODEL;
}

export function lunaMonthlyCapMicrocents(): number {
  const dollars = dollarsEnv("LUNA_MONTHLY_CAP_USD", 20);
  return Math.round(dollars * MICROCENTS_PER_DOLLAR);
}

/** Per-million-token prices in dollars; conservative and env-tunable. */
export function lunaPrices() {
  return {
    input: dollarsEnv("LUNA_PRICE_INPUT_PER_MTOK", 0.5),
    cachedInput: dollarsEnv("LUNA_PRICE_CACHED_INPUT_PER_MTOK", 0.05),
    output: dollarsEnv("LUNA_PRICE_OUTPUT_PER_MTOK", 4),
  };
}

export type TokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

/** Cost of a known token usage, in microcents. Never negative. */
export function costMicrocents(usage: TokenUsage): number {
  const price = lunaPrices();
  const fresh = Math.max(usage.inputTokens - usage.cachedInputTokens, 0);
  const dollars =
    (fresh / 1_000_000) * price.input +
    (Math.max(usage.cachedInputTokens, 0) / 1_000_000) * price.cachedInput +
    (Math.max(usage.outputTokens, 0) / 1_000_000) * price.output;
  return Math.max(Math.round(dollars * MICROCENTS_PER_DOLLAR), 0);
}

/**
 * Pre-call estimate. Characters are a rough proxy for tokens (~4 chars each)
 * and the output allowance is deliberately generous so the cap is enforced
 * before spend rather than after it.
 */
export function estimateMicrocents(promptChars: number, maxOutputTokens: number): number {
  return costMicrocents({
    inputTokens: Math.ceil(Math.max(promptChars, 0) / 4),
    cachedInputTokens: 0,
    outputTokens: Math.max(maxOutputTokens, 0),
  });
}

export function formatUsd(microcents: number): string {
  return `$${(Math.max(microcents, 0) / MICROCENTS_PER_DOLLAR).toFixed(2)}`;
}

type AdminClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
  };
};

async function admin(): Promise<AdminClient | null> {
  try {
    const mod = await import("@/integrations/supabase/client.server");
    return mod.supabaseAdmin as unknown as AdminClient;
  } catch {
    return null;
  }
}

type ReserveRow = {
  allowed: boolean;
  spent_microcents: number;
  cap_microcents: number;
  calls: number;
};

/** Atomically reserves the estimate against this month's cap. */
export async function reserveBudget(
  estimate: number,
): Promise<{ allowed: boolean; spent: number; cap: number; calls: number } | null> {
  const client = await admin();
  if (!client) return null;
  const { data, error } = await client.rpc("luna_budget_reserve", {
    _estimate_microcents: estimate,
    _cap_microcents: lunaMonthlyCapMicrocents(),
  });
  if (error || !Array.isArray(data) || !data.length) return null;
  const row = data[0] as ReserveRow;
  return {
    allowed: Boolean(row.allowed),
    spent: Number(row.spent_microcents) || 0,
    cap: Number(row.cap_microcents) || 0,
    calls: Number(row.calls) || 0,
  };
}

/** Replaces the reservation with the real cost once usage is known. */
async function settleBudget(estimate: number, actual: number) {
  const client = await admin();
  if (!client) return;
  await client.rpc("luna_budget_settle", {
    _estimate_microcents: estimate,
    _actual_microcents: actual,
  });
}

async function recordUsage(row: {
  organizationId: string | null;
  purpose: LunaPurpose;
  usage: TokenUsage;
  cost: number;
  outcome: "succeeded" | "failed" | "skipped";
  reason: string | null;
}) {
  const client = await admin();
  if (!client) return;
  await client.from("luna_usage_events").insert({
    organization_id: row.organizationId,
    model: lunaModel(),
    purpose: row.purpose,
    input_tokens: row.usage.inputTokens,
    cached_input_tokens: row.usage.cachedInputTokens,
    output_tokens: row.usage.outputTokens,
    cost_microcents: row.cost,
    outcome: row.outcome,
    reason: row.reason,
  });
}

function skip(reason: LunaSkipReason, detail: string | null = null): LunaResult {
  return { ok: false, reason, detail };
}

export type LunaRequest = {
  purpose: LunaPurpose;
  /** Compact, role-shaped instruction. Keep site context stable for caching. */
  system: string;
  user: string;
  organizationId?: string | null;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

/**
 * Calls Luna. Never throws: every failure path returns `{ ok: false, reason }`
 * so the caller falls through to the deterministic engine and the free pool.
 */
export async function callLuna(request: LunaRequest): Promise<LunaResult> {
  if (!lunaEnabled()) return skip(env("OPENAI_API_KEY") ? "disabled" : "no_key");
  const key = env("OPENAI_API_KEY");
  if (!key) return skip("no_key");

  const model = lunaModel();
  const maxOutputTokens = Math.max(request.maxOutputTokens ?? 900, 64);
  const promptChars = request.system.length + request.user.length;
  const estimate = estimateMicrocents(promptChars, maxOutputTokens);

  const reservation = await reserveBudget(estimate);
  if (!reservation) return skip("ledger_unavailable", "spend ledger unreachable");
  if (!reservation.allowed) {
    await recordUsage({
      organizationId: request.organizationId ?? null,
      purpose: request.purpose,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      cost: 0,
      outcome: "skipped",
      reason: "monthly cap reached",
    });
    return skip("budget_exhausted", `cap ${formatUsd(reservation.cap)} reached`);
  }

  const base = env("LUNA_BASE_URL") ?? "https://api.openai.com/v1";
  let response: Response;
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      // No timer-driven abort: an orchestration run is allowed to take as long
      // as it needs. Only an explicit user cancel signal aborts it.
      ...(request.signal ? { signal: request.signal } : {}),
      body: JSON.stringify({
        model,
        reasoning_effort: "none",
        max_completion_tokens: maxOutputTokens,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
      }),
    });
  } catch (error) {
    await settleBudget(estimate, 0);
    const detail = error instanceof Error ? error.message : "network error";
    await recordUsage({
      organizationId: request.organizationId ?? null,
      purpose: request.purpose,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      cost: 0,
      outcome: "failed",
      reason: detail.slice(0, 200),
    });
    return skip("provider_unavailable", detail);
  }

  if (!response.ok) {
    await settleBudget(estimate, 0);
    const reason: LunaSkipReason =
      response.status === 401 || response.status === 403
        ? "unauthorized"
        : response.status === 429
          ? "rate_limited"
          : "provider_unavailable";
    const detail = `${response.status}`;
    await recordUsage({
      organizationId: request.organizationId ?? null,
      purpose: request.purpose,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      cost: 0,
      outcome: "failed",
      reason: `http ${detail}`,
    });
    return skip(reason, detail);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    await settleBudget(estimate, 0);
    return skip("bad_response", "unreadable body");
  }

  const usage = readUsage(payload);
  const actual = costMicrocents(usage);
  await settleBudget(estimate, actual);

  const text = readText(payload);
  if (!text) {
    await recordUsage({
      organizationId: request.organizationId ?? null,
      purpose: request.purpose,
      usage,
      cost: actual,
      outcome: "failed",
      reason: "empty answer",
    });
    return skip("bad_response", "empty answer");
  }

  await recordUsage({
    organizationId: request.organizationId ?? null,
    purpose: request.purpose,
    usage,
    cost: actual,
    outcome: "succeeded",
    reason: null,
  });
  return { ok: true, text, model, costMicrocents: actual };
}

export function readUsage(payload: unknown): TokenUsage {
  const usage = (payload as { usage?: Record<string, unknown> } | null)?.usage ?? {};
  const details = (usage["prompt_tokens_details"] ?? {}) as Record<string, unknown>;
  const number = (value: unknown) => (typeof value === "number" && value >= 0 ? value : 0);
  return {
    inputTokens: number(usage["prompt_tokens"]),
    cachedInputTokens: number(details["cached_tokens"]),
    outputTokens: number(usage["completion_tokens"]),
  };
}

export function readText(payload: unknown): string | null {
  const choices = (payload as { choices?: unknown } | null)?.choices;
  if (!Array.isArray(choices) || !choices.length) return null;
  const content = (choices[0] as { message?: { content?: unknown } } | null)?.message?.content;
  if (typeof content !== "string") return null;
  const trimmed = content.trim();
  return trimmed.length ? trimmed : null;
}
