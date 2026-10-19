/**
 * Task-shaped Hall of Fame execution. Strict free-only mode skips the paid
 * collective entirely. Provider discovery, transport policy and account-level
 * free eligibility remain separate integration and verification requirements.
 */
import { selectTier, type CollectivePurpose, type CollectiveTier, type TaskComplexity } from "@/lib/ai/collective";
import {
  DEFAULT_CHAIN_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_SQUAD_SIZE,
  UNLIMITED_SQUAD,
  capabilityForPurpose,
  rankHallOfFame,
  roleForPurpose,
  type HallOfFameCandidate,
} from "@/lib/ai/hall-of-fame";
import { freeModelForm, recordFreeModelOutcome } from "@/lib/ai/free-reputation";
import { callCollective, type LunaSkipReason } from "@/lib/ai/luna.server";
import { paidCollectiveAllowed } from "@/lib/ai/free-only-policy.server";
import { scopedFreeOnly } from "@/lib/ai/spend-scope.server";

export type HallOfFameAttempt = {
  provider: string;
  model: string;
  ok: boolean;
  detail: string | null;
  latencyMs: number;
};
export type HallOfFameRun = {
  at: number;
  purpose: CollectivePurpose;
  capability: string;
  squadSize: number;
  attempts: HallOfFameAttempt[];
  answeredBy: string | null;
  paidReason: string | null;
};
const RUNS: HallOfFameRun[] = [];
const MAX_RUNS = 40;
function recordRun(run: HallOfFameRun) {
  RUNS.unshift(run);
  if (RUNS.length > MAX_RUNS) RUNS.length = MAX_RUNS;
}
export function recentHallOfFameRuns(limit = 20): HallOfFameRun[] {
  return RUNS.slice(0, Math.max(limit, 0));
}
export function resetHallOfFameRuns() {
  RUNS.length = 0;
}
export type HallOfFameOutcome =
  | { ok: true; text: string; provider: string; model: string; attempts: HallOfFameAttempt[] }
  | { ok: false; reason: "no_free_model" | "squad_exhausted"; detail: string | null; attempts: HallOfFameAttempt[] };

export async function hallOfFameSquad(
  purpose: CollectivePurpose,
  squadSize = DEFAULT_SQUAD_SIZE,
): Promise<{ role: string; capability: string; squad: HallOfFameCandidate[] }> {
  const role = roleForPurpose(purpose);
  const capability = capabilityForPurpose(purpose);
  let candidates: HallOfFameCandidate[] = [];
  try {
    const { buildFreeModelRegistry } = await import("@/lib/ai/registry.server");
    const registry = await buildFreeModelRegistry(role);
    // Keep direct OpenAI/Google API integrations outside this zero-spend
    // fallback path: credentials may be billable even when a model catalogue
    // lists a free tier. Those providers must only be used by a separately
    // verified, explicitly budgeted lane. Verified free models from providers
    // and aggregators that guarantee a zero-cost route remain eligible.
    candidates = registry
      .filter((entry) => entry.provider !== "openai" && entry.provider !== "google")
      .map((entry) => ({
        provider: entry.provider,
        model: entry.model,
        capabilities: entry.capabilities,
        weight: entry.weight,
        healthy: entry.health.healthy,
        remainingToday: entry.quota.remainingToday,
      }));
  } catch {
    // Catalogue failure is reported as an unavailable squad, never a template.
  }
  return {
    role,
    capability,
    squad: rankHallOfFame({
      purpose,
      candidates,
      squadSize,
      form: (candidate) => freeModelForm(candidate.provider, candidate.model).score,
    }),
  };
}
export type HallOfFameRequest = {
  purpose: CollectivePurpose;
  system: string;
  user: string;
  json?: boolean;
  maxOutputTokens?: number;
  organizationId?: string | null;
  userId?: string | null;
  /**
   * Explicit cap on how many members are tried (a caller that wants a quick
   * independent opinion). Omitted: the whole capable, ready list is walked
   * within the attempt and time bounds below.
   */
  squadSize?: number;
  paidReason?: string | null;
  onAttempt?: (provider: string, model: string) => void;
  /** A cancelled build stops the walk before the next member is called. */
  signal?: AbortSignal;
};

function positiveEnvInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name] ?? "");
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
}

/** Max members tried in one walk (HALL_OF_FAME_MAX_ATTEMPTS, default 16). */
export function hallOfFameMaxAttempts(): number {
  return positiveEnvInt("HALL_OF_FAME_MAX_ATTEMPTS", DEFAULT_MAX_ATTEMPTS);
}

/** Wall-clock budget for one walk (HALL_OF_FAME_CHAIN_MS, default 150s). */
export function hallOfFameChainMs(): number {
  return positiveEnvInt("HALL_OF_FAME_CHAIN_MS", DEFAULT_CHAIN_MS);
}

/**
 * A rejected key or a spent account fails the same way on every model of that
 * provider, so the walk skips that provider's remaining models (as the
 * router's chain does). Anything else is only that one model's failure.
 */
function providerWideFailure(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("category" in error)) return false;
  const category = (error as { category: unknown }).category;
  return category === "quota" || category === "unauthorized";
}

/** A member is not started with less than this much chain time left. */
const MIN_MEMBER_MS = 1_000;

/** ~6k tokens: above this Groq's free tier answers 413 "too large". */
export const GROQ_MAX_PROMPT_CHARS = 24_000;

export async function callHallOfFame(request: HallOfFameRequest): Promise<HallOfFameOutcome> {
  const { callPinnedFreeModel, extractJsonObject } = await import("@/lib/ai/router.server");
  const { durableProviderResting, refreshDurableRuntime } = await import("@/lib/ai/durable-health.server");
  await Promise.resolve(refreshDurableRuntime()).catch(() => undefined);
  // Rank the whole capable list; the walk itself is what is bounded.
  const { role, capability, squad } = await hallOfFameSquad(request.purpose, UNLIMITED_SQUAD);
  const maxAttempts =
    request.squadSize === undefined ? hallOfFameMaxAttempts() : Math.max(1, Math.floor(request.squadSize));
  const chainMs = hallOfFameChainMs();
  const walkStarted = Date.now();
  const deadProviders = new Set<string>();
  const attempts: HallOfFameAttempt[] = [];
  let stopReason: string | null = null;
  const finish = (answeredBy: string | null) => recordRun({
    at: Date.now(),
    purpose: request.purpose,
    capability,
    squadSize: squad.length,
    attempts,
    answeredBy,
    paidReason: request.paidReason ?? null,
  });
  if (!squad.length) {
    finish(null);
    return {
      ok: false,
      reason: "no_free_model",
      detail: `no verified free model can serve ${capability} right now`,
      attempts,
    };
  }
  for (const member of squad) {
    if (attempts.length >= maxAttempts) {
      stopReason = `attempt limit ${maxAttempts} reached`;
      break;
    }
    if (request.signal?.aborted) {
      stopReason = "request cancelled";
      break;
    }
    const remainingMs = chainMs - (Date.now() - walkStarted);
    if (remainingMs < MIN_MEMBER_MS) {
      stopReason = `chain deadline ${Math.round(chainMs / 1000)}s reached`;
      break;
    }
    if (deadProviders.has(member.provider)) continue;
    // Groq's free tier rejects large prompts (HTTP 413); send those elsewhere.
    if (member.provider === "groq" && request.system.length + request.user.length > GROQ_MAX_PROMPT_CHARS) continue;
    // A provider resting on its shared circuit (spent quota, repeated failures)
    // is skipped without a call, so the walk's time goes to models that answer.
    if (durableProviderResting(member.provider)) {
      deadProviders.add(member.provider);
      continue;
    }
    const started = Date.now();
    try {
      request.onAttempt?.(member.provider, member.model);
      const result = await callPinnedFreeModel(
        {
          task: `hall-of-fame.${request.purpose}`,
          organizationId: request.organizationId ?? null,
          userId: request.userId ?? null,
        },
        {
          provider: member.provider as Parameters<typeof callPinnedFreeModel>[1]["provider"],
          model: member.model,
          role: role as Parameters<typeof callPinnedFreeModel>[1]["role"],
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          // A member may not outlive the walk's own deadline (the router
          // never raises this above its own per-call limit).
          // A slow or wedged provider must not consume the entire chain budget.
          // Keep attempts bounded so the runner can rotate across the free pool.
          timeoutMs: Math.min(remainingMs, positiveEnvInt("HALL_OF_FAME_MEMBER_MS", 12_000)),
          ...(request.json === true ? { json: true } : {}),
          ...(request.maxOutputTokens === undefined ? {} : { maxOutputTokens: request.maxOutputTokens }),
        },
      );
      const text = result.text.trim();
      // A JSON answer in odd packaging (prose, fences, thinking tags) is
      // recovered with the router's tolerant parser before it counts as unusable.
      const usable =
        text.length > 0 && (request.json !== true || result.data !== null || extractJsonObject(text) !== null);
      recordFreeModelOutcome({
        provider: member.provider,
        model: member.model,
        ok: usable,
        latencyMs: result.latencyMs,
      });
      attempts.push({
        provider: member.provider,
        model: member.model,
        ok: usable,
        detail: usable ? null : "answer could not be used",
        latencyMs: result.latencyMs,
      });
      if (usable) {
        finish(`${member.provider} · ${member.model}`);
        return { ok: true, text, provider: member.provider, model: member.model, attempts };
      }
    } catch (error) {
      const latencyMs = Date.now() - started;
      recordFreeModelOutcome({ provider: member.provider, model: member.model, ok: false, latencyMs });
      if (providerWideFailure(error)) deadProviders.add(member.provider);
      attempts.push({
        provider: member.provider,
        model: member.model,
        ok: false,
        detail: error instanceof Error ? error.message.slice(0, 160) : "call failed",
        latencyMs,
      });
    }
  }
  // Fails closed: no deterministic substitute when the squad runs dry.
  finish(null);
  return {
    ok: false,
    reason: "squad_exhausted",
    detail: `${attempts.length} free model(s) tried, none could answer${stopReason ? ` (${stopReason})` : ""}`,
    attempts,
  };
}
export type ThinkerOutcome =
  | {
      ok: true;
      lane: "paid" | "free";
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
      lane: "free";
      tier: CollectiveTier | null;
      wanted: CollectiveTier;
      reason: LunaSkipReason | "no_tier_available" | "no_free_model" | "squad_exhausted";
      detail: string | null;
      attempts: HallOfFameAttempt[];
      handoverReason: string | null;
    };
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
}): Promise<ThinkerOutcome> {
  // Paid runs for the hardest steps within the daily cap (owner's choice);
  // everything else, an explicit free-only flag, or a free-only spending scope
  // (demo workspace builds) stays on the free pool.
  const strictFreeOnly = scopedFreeOnly() || !paidCollectiveAllowed(request.purpose);
  const paid = strictFreeOnly
    ? {
        ok: false as const,
        tier: null,
        wanted: selectTier({
          purpose: request.purpose,
          ...(request.complexity ? { complexity: request.complexity } : {}),
          available: [],
        }).wanted,
        reason: "free_only",
        detail: "Paid collective skipped by free-only policy.",
      }
    : await callCollective({
        purpose: request.purpose,
        system: request.system,
        user: request.user,
        ...(request.complexity ? { complexity: request.complexity } : {}),
        ...(request.organizationId === undefined ? {} : { organizationId: request.organizationId }),
        ...(request.maxOutputTokens === undefined ? {} : { maxOutputTokens: request.maxOutputTokens }),
        ...(request.signal ? { signal: request.signal } : {}),
      });
  if (paid.ok) {
    return {
      ok: true, lane: "paid", tier: paid.tier, wanted: paid.wanted,
      downgraded: paid.downgraded, text: paid.text, model: paid.model,
      costMicrocents: paid.costMicrocents, attempts: [], handoverReason: null,
    };
  }
  const handoverReason = paid.detail ? `${paid.reason}: ${paid.detail}` : paid.reason;
  const free = await callHallOfFame({
    purpose: request.purpose, system: request.system, user: request.user,
    ...(request.json === undefined ? {} : { json: request.json }),
    ...(request.maxOutputTokens === undefined ? {} : { maxOutputTokens: request.maxOutputTokens }),
    ...(request.organizationId === undefined ? {} : { organizationId: request.organizationId }),
    ...(request.userId === undefined ? {} : { userId: request.userId }),
    ...(request.onAttempt === undefined ? {} : { onAttempt: request.onAttempt }),
    ...(request.signal ? { signal: request.signal } : {}),
    paidReason: handoverReason,
  });
  if (free.ok) {
    return {
      ok: true, lane: "free", tier: null, wanted: paid.wanted,
      downgraded: !strictFreeOnly, text: free.text, model: `${free.provider} · ${free.model}`,
      costMicrocents: 0, attempts: free.attempts, handoverReason,
    };
  }
  return {
    ok: false, lane: "free", tier: paid.tier, wanted: paid.wanted,
    reason: free.reason, detail: free.detail, attempts: free.attempts, handoverReason,
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
      ? outcome.handoverReason ? `free squad took over: ${outcome.handoverReason}` : `routed to ${outcome.tier ?? "free"} tier`
      : `${outcome.reason}${outcome.detail ? `: ${outcome.detail}` : ""}`,
    contribution: outcome.ok ? `${outcome.text.length} chars` : null,
    costMicrocents: outcome.ok ? outcome.costMicrocents ?? 0 : 0,
  });
  return outcome;
}
