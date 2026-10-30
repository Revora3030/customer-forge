/**
 * The builder's thinker: every step runs on the Lovable AI team through the
 * shared router, under Luna's monthly + per-workspace reservation.
 */
import { COLLECTIVE_TIERS, selectTier, type CollectivePurpose, type CollectiveTier, type TaskComplexity } from "@/lib/ai/collective";
import { roleForPurpose } from "@/lib/ai/thinker-role";
import {
  costMicrocents,
  estimateMicrocents,
  recordUsage,
  reserveBudget,
  settleBudget,
  type LunaSkipReason,
} from "@/lib/ai/luna.server";
import { paidCollectiveAllowed } from "@/lib/ai/free-only-policy.server";
import { scopedBuildStopped, scopedFreeOnly } from "@/lib/ai/spend-scope.server";

export type HallOfFameAttempt = {
  provider: string;
  model: string;
  ok: boolean;
  detail: string | null;
  latencyMs: number;
};

export type ThinkerOutcome =
  | {
      ok: true;
      lane: "paid";
      tier: CollectiveTier | null;
      wanted: CollectiveTier;
      downgraded: boolean;
      text: string;
      model: string;
      costMicrocents: number;
      attempts: HallOfFameAttempt[];
      handoverReason: string | null;
    }
  | {
      ok: false;
      lane: "paid";
      tier: CollectiveTier | null;
      wanted: CollectiveTier;
      reason: LunaSkipReason | "no_tier_available" | "free_only";
      detail: string | null;
      attempts: HallOfFameAttempt[];
      handoverReason: string | null;
    };
type PaidThinkerOutcome =
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
      reason: LunaSkipReason | "no_tier_available" | "free_only";
      detail: string | null;
    };

/** Maps a router failure to the reason the handover line and ledger report. */
function paidSkipReason(error: unknown): LunaSkipReason {
  const category = (error as { category?: string | null } | null)?.category ?? null;
  if (category === "unauthorized") return "unauthorized";
  if (category === "rate_limited") return "rate_limited";
  if (category === "not_configured") return "no_key";
  if (category === "bad_response" || category === "invalid_request" || category === "too_large")
    return "bad_response";
  return "provider_unavailable";
}

/**
 * The builder's paid thinker: one walk over the shared router's paid team
 * (Lovable's gateway first, then Revora's own paid keys), under Luna's
 * monthly + per-workspace reservation and the router's daily cap. The monthly
 * reservation is held here for the whole walk (`budgetReservedExternally`)
 * so the router does not reserve a second time for each model it tries; the
 * walk settles exactly once with the real cost, or 0 / the estimate for
 * unbilled / unknown outcomes. Never throws.
 */
async function callPaidThinker(request: {
  purpose: CollectivePurpose;
  system: string;
  user: string;
  complexity?: TaskComplexity;
  organizationId?: string | null;
  userId?: string | null;
  maxOutputTokens?: number;
  json?: boolean;
  signal?: AbortSignal;
  preferModels?: string[];
  avoidModels?: string[];
}): Promise<PaidThinkerOutcome> {
  const selection = selectTier({
    purpose: request.purpose,
    ...(request.complexity ? { complexity: request.complexity } : {}),
    available: COLLECTIVE_TIERS,
  });
  const wanted = selection.wanted;
  if (selection.tier === null)
    return { ok: false, tier: null, wanted, reason: "no_tier_available", detail: "no paid tier configured" };
  const tier = selection.tier;
  // A cancelled build never reaches a paid provider (nothing is reserved either).
  if (request.signal?.aborted || scopedBuildStopped())
    return { ok: false, tier, wanted, reason: "provider_unavailable", detail: "request cancelled" };
  // Loaded before any reservation, so a router that cannot load fails closed
  // with no spend held.
  let router: typeof import("@/lib/ai/router.server");
  try {
    router = await import("@/lib/ai/router.server");
  } catch {
    return { ok: false, tier, wanted, reason: "provider_unavailable", detail: "AI router unavailable" };
  }

  const organizationId = request.organizationId ?? null;
  const maxOutputTokens = Math.max(request.maxOutputTokens ?? 900, 64);
  // Bounded context: an oversized brief costs more and answers worse. The
  // head and tail are kept (instructions and the latest facts), the middle cut.
  const user = capPromptContext(request.user, THINKER_MAX_USER_CHARS);
  const promptChars = request.system.length + user.length;
  const estimate = estimateMicrocents(promptChars, maxOutputTokens, tier);
  const reservation = await reserveBudget(estimate, organizationId);
  if (!reservation)
    return { ok: false, tier, wanted, reason: "ledger_unavailable", detail: "spend ledger unreachable" };
  if (!reservation.allowed) {
    await recordUsage({
      organizationId,
      purpose: request.purpose,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      cost: 0,
      outcome: "skipped",
      reason: reservation.dailyCapped ? "daily paid cap reached" : "monthly cap reached",
    });
    return {
      ok: false,
      tier,
      wanted,
      reason: "budget_exhausted",
      detail: reservation.dailyCapped ? "today's paid AI cap reached" : "monthly paid AI cap reached",
    };
  }

  // Settled exactly once: real cost on success; 0 for a definite unbilled
  // rejection; the estimate when the outcome is unknown and may be billed.
  let settled = false;
  const settle = async (actual: number) => {
    if (settled) return;
    settled = true;
    await settleBudget(organizationId, estimate, actual, reservation.paid);
  };
  try {
    const { extractJsonObject, generateStructuredOutput, generateText } = router;
    const caller = {
      task: `builder-thinker.${request.purpose}`,
      organizationId,
      userId: request.userId ?? null,
    };
    const aiRequest = {
      role: roleForPurpose(request.purpose) as NonNullable<Parameters<typeof generateText>[1]["role"]>,
      messages: [
        { role: "system" as const, content: request.system },
        { role: "user" as const, content: user },
      ],
      paidOnly: true,
      ...(request.preferModels?.length ? { preferModels: request.preferModels } : {}),
      ...(request.avoidModels?.length ? { avoidModels: request.avoidModels } : {}),
      maxOutputTokens,
      // One thinker step gets a bounded share of the build's wall-clock, not
      // the router's whole six-minute chain budget.
      chainDeadlineMs: thinkerChainBudgetMs(maxOutputTokens),
    };
    const lane = {
      budgetReservedExternally: true,
      longAttemptMs: thinkerAttemptTimeoutMs(maxOutputTokens),
      ...(request.signal ? { signal: request.signal } : {}),
    };
    const outcome =
      request.json === true
        ? await generateStructuredOutput(caller, aiRequest, lane)
        : await generateText(caller, aiRequest, lane);
    const text = outcome.text.trim();
    const billed =
      outcome.usage.inputTokens === null && outcome.usage.outputTokens === null
        ? estimate
        : costMicrocents(
            {
              inputTokens: outcome.usage.inputTokens ?? Math.ceil(promptChars / 4),
              cachedInputTokens: 0,
              outputTokens: outcome.usage.outputTokens ?? 0,
            },
            tier,
          );
    const model = `${outcome.provider} · ${outcome.model}`;
    const usable =
      text.length > 0 &&
      (request.json !== true ||
        ("data" in outcome && outcome.data !== null) ||
        extractJsonObject(text) !== null);
    await settle(billed);
    await recordUsage({
      organizationId,
      purpose: request.purpose,
      model,
      usage: {
        inputTokens: outcome.usage.inputTokens ?? 0,
        cachedInputTokens: 0,
        outputTokens: outcome.usage.outputTokens ?? 0,
      },
      cost: billed,
      outcome: usable ? "succeeded" : "failed",
      reason: usable ? null : "answer could not be used",
    });
    if (!usable)
      return { ok: false, tier, wanted, reason: "bad_response", detail: "paid answer was not usable" };
    return {
      ok: true,
      tier,
      wanted,
      downgraded: selection.tier !== selection.wanted,
      text,
      model,
      costMicrocents: billed,
    };
  } catch (error) {
    const charge = router.paidFailureCharge(error as Parameters<typeof router.paidFailureCharge>[0], estimate);
    await settle(charge);
    const detail = error instanceof Error ? error.message.slice(0, 160) : "paid call failed";
    await recordUsage({
      organizationId,
      purpose: request.purpose,
      usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      cost: charge,
      outcome: "failed",
      reason: detail,
    });
    return { ok: false, tier, wanted, reason: paidSkipReason(error), detail };
  }
}

async function callBestThinkerInner(request: {
  purpose: CollectivePurpose;
  system: string;
  user: string;
  complexity?: TaskComplexity;
  organizationId?: string | null;
  userId?: string | null;
  maxOutputTokens?: number;
  json?: boolean;
  signal?: AbortSignal;
  onAttempt?: (provider: string, model: string) => void;
  preferModels?: string[];
  avoidModels?: string[];
}): Promise<ThinkerOutcome> {
  // Lovable AI is the only team. A no-spend scope (or an explicit no-spend
  // flag) means no AI call at all: the job waits instead of using a substitute.
  const noSpend = scopedFreeOnly() || !paidCollectiveAllowed(request.purpose);
  const paid: PaidThinkerOutcome = noSpend
    ? {
        ok: false as const,
        tier: null,
        wanted: selectTier({
          purpose: request.purpose,
          ...(request.complexity ? { complexity: request.complexity } : {}),
          available: [],
        }).wanted,
        reason: "free_only",
        detail: "AI spending is switched off for this run.",
      }
    : await callPaidThinker(request);
  if (paid.ok) {
    return {
      ok: true, lane: "paid", tier: paid.tier, wanted: paid.wanted,
      downgraded: paid.downgraded, text: paid.text, model: paid.model,
      costMicrocents: paid.costMicrocents, attempts: [], handoverReason: null,
    };
  }
  return {
    ok: false, lane: "paid", tier: paid.tier, wanted: paid.wanted,
    reason: paid.reason, detail: paid.detail, attempts: [], handoverReason: null,
  };
}
export async function callBestThinker(
  request: Parameters<typeof callBestThinkerInner>[0] & { stage?: string; area?: string },
): Promise<ThinkerOutcome> {
  const started = Date.now();
  const outcome = await callBestThinkerInner(request);
  const { recordTeamStep } = await import("@/lib/ai/telemetry.server");
  await recordTeamStep({
    organizationId: request.organizationId ?? null,
    stage: request.stage ?? request.purpose,
    purpose: request.purpose, lane: outcome.lane, model: outcome.ok ? outcome.model : null,
    ok: outcome.ok, latencyMs: Date.now() - started,
    reason: outcome.ok
      ? `routed to ${outcome.tier ?? "lovable"} tier`
      : `${outcome.reason}${outcome.detail ? `: ${outcome.detail}` : ""}`,
    contribution: outcome.ok ? `${outcome.text.length} chars` : null,
    costMicrocents: outcome.ok ? outcome.costMicrocents ?? 0 : 0,
  });
  return outcome;
}

/**
 * Per-attempt time for one thinker answer, scaled to its length. A full page
 * plan (8k tokens) took ~90s and the flat 90s limit aborted it just before it
 * finished, so long answers get up to ~4 minutes; short ones keep 90s.
 */
/** Largest user prompt one thinker step sends (about 15k tokens). */
export const THINKER_MAX_USER_CHARS = 60_000;

/** Keeps the first 70% and last 30% of an over-long prompt with a visible cut marker. */
export function capPromptContext(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const marker = `\n\n[… ${text.length - maxChars} characters of context trimmed …]\n\n`;
  const room = Math.max(0, maxChars - marker.length);
  const head = Math.ceil(room * 0.7);
  return text.slice(0, head) + marker + text.slice(text.length - (room - head));
}

export function thinkerAttemptTimeoutMs(maxOutputTokens: number): number {
  return Math.min(240_000, Math.max(90_000, 30_000 + Math.ceil(maxOutputTokens) * 25));
}

/**
 * Wall-clock for one thinker step across every model it may try: a full
 * attempt for the first model AND a full attempt for the one that takes over,
 * plus a little slack. A flat five minutes let a first model that burned two
 * attempts (125 s each, seen on the gateway) leave its fallback 49 s, which no
 * long answer can finish in, so the step failed with an idle fallback.
 */
export function thinkerChainBudgetMs(maxOutputTokens: number): number {
  return Math.min(360_000, thinkerAttemptTimeoutMs(maxOutputTokens) * 2 + 10_000);
}
