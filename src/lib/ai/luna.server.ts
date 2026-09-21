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

import {
  COLLECTIVE_TIERS,
  DEFAULT_COLLECTIVE_MODELS,
  selectTier,
  type CollectivePurpose,
  type CollectiveTier,
  type TaskComplexity,
} from "@/lib/ai/collective";

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
  | "repair_review"
  | "image_generation";

/**
 * The three paid tiers. `luna` keeps its original behaviour exactly; `sol` and
 * `terra` are the master and senior-specialist lanes, reached through the same
 * credential gate, the same durable monthly cap and the same usage ledger.
 */
export const DEFAULT_TIER_MODELS: Record<CollectiveTier, string> = {
  ...DEFAULT_COLLECTIVE_MODELS,
  luna: DEFAULT_LUNA_MODEL,
};

const TIER_MODEL_ENV: Record<CollectiveTier, string> = {
  sol: "SOL_MODEL",
  terra: "TERRA_MODEL",
  luna: "LUNA_MODEL",
};

const TIER_PRICE_DEFAULTS: Record<
  CollectiveTier,
  { input: number; cachedInput: number; output: number }
> = {
  sol: { input: 1.25, cachedInput: 0.125, output: 10 },
  terra: { input: 0.5, cachedInput: 0.05, output: 4 },
  luna: { input: 0.5, cachedInput: 0.05, output: 4 },
};

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

/** Luna is off unless an operator explicitly enables diagnostics. */
export function lunaEnabled(): boolean {
  const raw = (env("LUNA_ENABLED") ?? "").toLowerCase();
  const optedIn = raw === "true" || raw === "1" || raw === "on" || raw === "yes";
  const nativeOnly = (env("ZERO_AI_COST_MODE") ?? "").toLowerCase();
  const externalAllowed = (env("BUILDER_EXTERNAL_AI_ALLOWED") ?? "").toLowerCase();
  const nativeOnlyOff =
    nativeOnly === "false" || nativeOnly === "0" || nativeOnly === "off" || nativeOnly === "no";
  const diagnosticOptIn =
    externalAllowed === "true" ||
    externalAllowed === "1" ||
    externalAllowed === "on" ||
    externalAllowed === "yes";
  return optedIn && nativeOnlyOff && diagnosticOptIn && Boolean(env("OPENAI_API_KEY"));
}

export function lunaModel(): string {
  return env("LUNA_MODEL") ?? DEFAULT_LUNA_MODEL;
}

/** The model serving one tier. Env override, else the tier default. */
export function tierModel(tier: CollectiveTier): string {
  return env(TIER_MODEL_ENV[tier]) ?? DEFAULT_TIER_MODELS[tier];
}

/**
 * Which tiers may be used right now. The whole collective shares one opt-in:
 * if the paid lane is off, no tier is available and nothing is ever selected.
 * A tier can additionally be switched off on its own (`SOL_ENABLED=false`).
 */
export function availableTiers(): CollectiveTier[] {
  if (!lunaEnabled()) return [];
  return COLLECTIVE_TIERS.filter((tier) => {
    const raw = (env(`${tier.toUpperCase()}_ENABLED`) ?? "").toLowerCase();
    return !(raw === "false" || raw === "0" || raw === "off" || raw === "no");
  });
}

export function lunaMonthlyCapMicrocents(): number {
  const dollars = dollarsEnv("LUNA_MONTHLY_CAP_USD", 20);
  return Math.round(dollars * MICROCENTS_PER_DOLLAR);
}

/** Per-workspace diagnostic allocation; it can never exceed the global cap. */
export function lunaTenantMonthlyCapMicrocents(): number {
  const globalCap = lunaMonthlyCapMicrocents();
  const configured = Math.round(
    dollarsEnv("LUNA_TENANT_MONTHLY_CAP_USD", globalCap / MICROCENTS_PER_DOLLAR) *
      MICROCENTS_PER_DOLLAR,
  );
  return Math.min(configured, globalCap);
}

/** Per-million-token prices in dollars; conservative and env-tunable. */
export function lunaPrices() {
  return tierPrices("luna");
}

/** Per-tier prices. Deliberately over-estimated so the cap binds early. */
export function tierPrices(tier: CollectiveTier) {
  const prefix = tier.toUpperCase();
  const fallback = TIER_PRICE_DEFAULTS[tier];
  return {
    input: dollarsEnv(`${prefix}_PRICE_INPUT_PER_MTOK`, fallback.input),
    cachedInput: dollarsEnv(`${prefix}_PRICE_CACHED_INPUT_PER_MTOK`, fallback.cachedInput),
    output: dollarsEnv(`${prefix}_PRICE_OUTPUT_PER_MTOK`, fallback.output),
  };
}

export type TokenUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

/** Cost of a known token usage, in microcents. Never negative. */
export function costMicrocents(usage: TokenUsage, tier: CollectiveTier = "luna"): number {
  const price = tierPrices(tier);
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
export function estimateMicrocents(
  promptChars: number,
  maxOutputTokens: number,
  tier: CollectiveTier = "luna",
): number {
  return costMicrocents(
    {
      inputTokens: Math.ceil(Math.max(promptChars, 0) / 4),
      cachedInputTokens: 0,
      outputTokens: Math.max(maxOutputTokens, 0),
    },
    tier,
  );
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
  tenant_spent_microcents: number;
  tenant_cap_microcents: number;
};

/** Atomically reserves against both the workspace allocation and global cap. */
export async function reserveBudget(
  estimate: number,
  organizationId: string | null = null,
): Promise<{
  allowed: boolean;
  spent: number;
  cap: number;
  calls: number;
  tenantSpent: number;
  tenantCap: number;
} | null> {
  const client = await admin();
  if (!client) return null;
  const { data, error } = await client.rpc("luna_budget_reserve_tenant", {
    _organization_id: organizationId,
    _estimate_microcents: estimate,
    _global_cap_microcents: lunaMonthlyCapMicrocents(),
    _tenant_cap_microcents: lunaTenantMonthlyCapMicrocents(),
  });
  if (error || !Array.isArray(data) || !data.length) return null;
  const row = data[0] as ReserveRow;
  return {
    allowed: Boolean(row.allowed),
    spent: Number(row.spent_microcents) || 0,
    cap: Number(row.cap_microcents) || 0,
    calls: Number(row.calls) || 0,
    tenantSpent: Number(row.tenant_spent_microcents) || 0,
    tenantCap: Number(row.tenant_cap_microcents) || 0,
  };
}

/** Replaces the reservation with the real cost once usage is known. */
export async function settleBudget(organizationId: string | null, estimate: number, actual: number) {
  const client = await admin();
  if (!client) return;
  await client.rpc("luna_budget_settle_tenant", {
    _organization_id: organizationId,
    _estimate_microcents: estimate,
    _actual_microcents: actual,
  });
}

export async function recordUsage(row: {
  organizationId: string | null;
  purpose: LunaPurpose | CollectivePurpose;
  model?: string;
  usage: TokenUsage;
  cost: number;
  outcome: "succeeded" | "failed" | "skipped";
  reason: string | null;
}) {
  const client = await admin();
  if (!client) return;
  await client.from("luna_usage_events").insert({
    organization_id: row.organizationId,
    model: row.model ?? lunaModel(),
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
  purpose: LunaPurpose | CollectivePurpose;
  /** Compact, role-shaped instruction. Keep site context stable for caching. */
  system: string;
  user: string;
  organizationId?: string | null;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  /** Which paid tier serves this call. Defaults to the economical lane. */
  tier?: CollectiveTier;
};

/**
 * Calls the paid lane. Never throws: every failure path returns
 * `{ ok: false, reason }` so the caller falls through to the deterministic
 * engine and the free pool.
 */
export async function callLuna(request: LunaRequest): Promise<LunaResult> {
  if (!lunaEnabled()) return skip(env("OPENAI_API_KEY") ? "disabled" : "no_key");
  const key = env("OPENAI_API_KEY");
  if (!key) return skip("no_key");

  const tier: CollectiveTier = request.tier ?? "luna";
  if (!availableTiers().includes(tier)) return skip("disabled", `${tier} tier is switched off`);

  const model = tierModel(tier);
  const maxOutputTokens = Math.max(request.maxOutputTokens ?? 900, 64);
  const promptChars = request.system.length + request.user.length;
  const estimate = estimateMicrocents(promptChars, maxOutputTokens, tier);
  const organizationId = request.organizationId ?? null;

  const reservation = await reserveBudget(estimate, organizationId);
  if (!reservation) return skip("ledger_unavailable", "spend ledger unreachable");
  if (!reservation.allowed) {
    await recordUsage({
      organizationId,
      purpose: request.purpose,
      model,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      cost: 0,
      outcome: "skipped",
      reason: "monthly cap reached",
    });
    const tenantBlocked = reservation.tenantSpent + estimate > reservation.tenantCap;
    return skip(
      "budget_exhausted",
      tenantBlocked
        ? `workspace allocation ${formatUsd(reservation.tenantCap)} reached`
        : `global cap ${formatUsd(reservation.cap)} reached`,
    );
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
    await settleBudget(organizationId, estimate, 0);
    const detail = error instanceof Error ? error.message : "network error";
    await recordUsage({
      organizationId,
      purpose: request.purpose,
      model,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      cost: 0,
      outcome: "failed",
      reason: detail.slice(0, 200),
    });
    return skip("provider_unavailable", detail);
  }

  if (!response.ok) {
    await settleBudget(organizationId, estimate, 0);
    const reason: LunaSkipReason =
      response.status === 401 || response.status === 403
        ? "unauthorized"
        : response.status === 429
          ? "rate_limited"
          : "provider_unavailable";
    const detail = `${response.status}`;
    await recordUsage({
      organizationId,
      purpose: request.purpose,
      model,
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
    await settleBudget(organizationId, estimate, 0);
    return skip("bad_response", "unreadable body");
  }

  const usage = readUsage(payload);
  const actual = costMicrocents(usage, tier);
  await settleBudget(organizationId, estimate, actual);

  const text = readText(payload);
  if (!text) {
    await recordUsage({
      organizationId,
      purpose: request.purpose,
      model,
      usage,
      cost: actual,
      outcome: "failed",
      reason: "empty answer",
    });
    return skip("bad_response", "empty answer");
  }

  await recordUsage({
    organizationId,
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

/* ------------------------------ the collective ----------------------------- */

export type CollectiveOutcome =
  | {
      ok: true;
      tier: CollectiveTier;
      wanted: CollectiveTier;
      downgraded: boolean;
      text: string;
      model: string;
      costMicrocents: number;
    }
  | {
      ok: false;
      tier: CollectiveTier | null;
      wanted: CollectiveTier;
      reason: LunaSkipReason | "no_tier_available";
      detail: string | null;
    };

/**
 * The single entry point for paid thinking.
 *
 * It classifies the task, picks the strongest *available* tier, and calls it
 * through the same credential gate, monthly cap and usage ledger as before.
 * It never throws and never blocks: with the paid lane off — which is the
 * default — it returns `no_tier_available` immediately and the caller keeps
 * running on the free fabric and the deterministic engine.
 */
export async function callCollective(request: {
  purpose: CollectivePurpose;
  system: string;
  user: string;
  complexity?: TaskComplexity;
  organizationId?: string | null;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}): Promise<CollectiveOutcome> {
  const selection = selectTier({
    purpose: request.purpose,
    ...(request.complexity ? { complexity: request.complexity } : {}),
    available: availableTiers(),
  });
  if (selection.tier === null) {
    return {
      ok: false,
      tier: null,
      wanted: selection.wanted,
      reason: "no_tier_available",
      detail: lunaEnabled() ? "every tier is switched off" : "paid AI is not enabled",
    };
  }

  const result = await callLuna({
    purpose: request.purpose,
    system: request.system,
    user: request.user,
    tier: selection.tier,
    ...(request.organizationId === undefined ? {} : { organizationId: request.organizationId }),
    ...(request.maxOutputTokens === undefined
      ? {}
      : { maxOutputTokens: request.maxOutputTokens }),
    ...(request.signal ? { signal: request.signal } : {}),
  });

  if (!result.ok) {
    return {
      ok: false,
      tier: selection.tier,
      wanted: selection.wanted,
      reason: result.reason,
      detail: result.detail,
    };
  }
  return {
    ok: true,
    tier: selection.tier,
    wanted: selection.wanted,
    downgraded: selection.downgraded,
    text: result.text,
    model: result.model,
    costMicrocents: result.costMicrocents,
  };
}

/** Admin-facing truth about each tier: model, on/off, nothing secret. */
export function collectiveStatus() {
  const enabled = availableTiers();
  return COLLECTIVE_TIERS.map((tier) => ({
    tier,
    model: tierModel(tier),
    defaultModel: DEFAULT_COLLECTIVE_MODELS[tier],
    enabled: enabled.includes(tier),
  }));
}
