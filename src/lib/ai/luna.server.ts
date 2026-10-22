/**
 * Luna — the monthly + per-workspace spending ledger for Lovable AI.
 *
 * Every AI call reserves against a durable monthly cap (default $100/month)
 * enforced in our own database before it runs, and settles the real cost
 * after. Server-only; never returns a key.
 */

import {
  COLLECTIVE_TIERS,
  DEFAULT_COLLECTIVE_MODELS,
  PEER_PURPOSE_MODELS,
  purposeTier,
  selectTier,
  type CollectivePurpose,
  type CollectiveTier,
  type TaskComplexity,
} from "@/lib/ai/collective";

import { scopedFreeOnly } from "@/lib/ai/spend-scope.server";
import type { PaidReservation } from "@/lib/ai/paid-budget.server";

/** Microcents: one hundred-millionth of a dollar. $20 => 2_000_000_000. */
export const MICROCENTS_PER_DOLLAR = 100_000_000;
export const DEFAULT_MONTHLY_CAP_MICROCENTS = 100 * MICROCENTS_PER_DOLLAR;

/** The paid orchestrator model. Overridable without a deploy. */
export const DEFAULT_LUNA_MODEL = "gpt-6-luna";

export type LunaPurpose =
  | "intent"
  | "plan_review"
  | "design_direction"
  | "visual_review"
  | "repair_review"
  | "image_generation"
  | "video_generation";


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

/**
 * The premium tiers are available whenever the key is present and no operator
 * switch turns them off. Spend stays bounded by the monthly cap, not by keeping
 * the tiers dark.
 */
export function lunaEnabled(): boolean {
  const off = (name: string) => {
    const raw = (env(name) ?? "").toLowerCase();
    return raw === "false" || raw === "0" || raw === "off" || raw === "no";
  };
  const on = (name: string) => {
    const raw = (env(name) ?? "").toLowerCase();
    return raw === "true" || raw === "1" || raw === "on" || raw === "yes";
  };
  if (off("LUNA_ENABLED")) return false;
  // The Lovable AI Gateway key serves the paid team since the owner removed
  // the direct OpenAI key (2026-10-22); either key enables the capped lane.
  return Boolean(env("LOVABLE_API_KEY"));
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
  const dollars = dollarsEnv("LUNA_MONTHLY_CAP_USD", 100);
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
  /** True when the month allowed the call but today's paid cap did not. */
  dailyCapped: boolean;
  /** Today's paid-cap reservation; pass it back to settleBudget. */
  paid: PaidReservation | null;
} | null> {
  // A free-only spending scope (demo builds) never touches a paid ledger,
  // not even with a reserve-then-release on the monthly one.
  if (scopedFreeOnly()) return null;
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
  let dailyCapped = false;
  let paid: PaidReservation | null = null;
  // The owner's daily paid cap applies on top of the monthly ledger: a call
  // the month allows but today's cap doesn't is released and refused.
  if (row.allowed) {
    const { reservePaidSpend } = await import("@/lib/ai/paid-budget.server");
    paid = await reservePaidSpend(estimate);
    if (!paid) {
      await client.rpc("luna_budget_settle_tenant", {
        _organization_id: organizationId,
        _estimate_microcents: estimate,
        _actual_microcents: 0,
      });
      row.allowed = false;
      dailyCapped = true;
    }
  }
  return {
    allowed: Boolean(row.allowed),
    dailyCapped,
    paid,
    spent: Number(row.spent_microcents) || 0,
    cap: Number(row.cap_microcents) || 0,
    calls: Number(row.calls) || 0,
    tenantSpent: Number(row.tenant_spent_microcents) || 0,
    tenantCap: Number(row.tenant_cap_microcents) || 0,
  };
}

/**
 * Replaces the reservation with the real cost once usage is known. The daily
 * paid reservation is settled by its own id (never by "today", which is the
 * wrong day for a call that crossed midnight UTC), and in a `finally`, so a
 * monthly-ledger failure cannot leave it holding today's cap.
 */
export async function settleBudget(
  organizationId: string | null,
  estimate: number,
  actual: number,
  paid: PaidReservation | null = null,
) {
  try {
    const client = await admin();
    if (!client) return;
    await client.rpc("luna_budget_settle_tenant", {
      _organization_id: organizationId,
      _estimate_microcents: estimate,
      _actual_microcents: actual,
    });
  } finally {
    if (paid) {
      const { settlePaidSpend } = await import("@/lib/ai/paid-budget.server");
      await settlePaidSpend(paid, actual);
    }
  }
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

/** Most of an error body Revora will read: enough for OpenAI's error object. */
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
