/**
 * Task-shaped Hall of Fame execution. Strict free-only mode skips the paid
 * collective entirely. Provider discovery, transport policy and account-level
 * free eligibility remain separate integration and verification requirements.
 */
import {
  COLLECTIVE_TIERS,
  selectTier,
  type CollectivePurpose,
  type CollectiveTier,
  type TaskComplexity,
} from "@/lib/ai/collective";
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
import {
  estimateMicrocents,
  recordUsage,
  reserveBudget,
  settleBudget,
  type LunaSkipReason,
} from "@/lib/ai/luna.server";
import { paidCollectiveAllowed } from "@/lib/ai/free-only-policy.server";
import { modelCostMicrocents, rosterEstimateMicrocents } from "@/lib/ai/model-prices";
import { providerChain, type ModelRole } from "@/lib/ai/config";

/** Every paid model the router may try for a role (plus preferred ids), for pricing a walk. */
export function paidRosterFor(role: string, prefer: readonly string[] = []): string[] {
  const models = new Set<string>(prefer);
  for (const config of providerChain())
    for (const id of (config.models[role as ModelRole] ?? "").split(",")) if (id.trim()) models.add(id.trim());
  return [...models];
}
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
  // Per-worker cooldowns are run memory too; tests start from a clean slate.
  resetHallOfFameCooldowns();
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
  return category === "quota" || category === "unauthorized" || category === "rate_limited";
}

/**
 * Calls in flight per provider across every concurrent walk in this worker.
 * A build runs many review purposes at once; without this they all hit the
 * same free service in the same second and its per-minute limit fails them.
 */
const inFlight = new Map<string, number>();
export const HALL_OF_FAME_PER_PROVIDER_CONCURRENCY = 2;
export function hallOfFameProviderBusy(provider: string): boolean {
  return (inFlight.get(provider) ?? 0) >= positiveEnvInt("HALL_OF_FAME_PROVIDER_CONCURRENCY", HALL_OF_FAME_PER_PROVIDER_CONCURRENCY);
}
function enter(provider: string) {
  inFlight.set(provider, (inFlight.get(provider) ?? 0) + 1);
}
function leave(provider: string) {
  const next = (inFlight.get(provider) ?? 1) - 1;
  if (next <= 0) inFlight.delete(provider);
  else inFlight.set(provider, next);
}

/**
 * Short process-wide cooldowns shared by every concurrent walk. A walk already
 * skips a provider that rate-limited IT, but a build runs dozens of walks at
 * once: each one used to call the same 429-ing free service again (one test
 * build logged 21 rate-limit answers from one provider) and each one waited
 * out the same wedged provider's 45s timeout. A rate limit cools the provider
 * for every walk at once; two timeouts in a row do the same. A success clears
 * it. The shared durable circuit still decides longer rests.
 */
export const HALL_OF_FAME_RATE_LIMIT_COOL_MS = 60_000;
export const HALL_OF_FAME_TIMEOUT_COOL_MS = 120_000;
const coolUntil = new Map<string, number>();
const consecutiveTimeouts = new Map<string, number>();
export function hallOfFameProviderCooling(provider: string, now = Date.now()): boolean {
  const until = coolUntil.get(provider);
  if (until === undefined) return false;
  if (until > now) return true;
  coolUntil.delete(provider);
  return false;
}
function errorCategory(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("category" in error)) return null;
  const category = (error as { category: unknown }).category;
  return typeof category === "string" ? category : null;
}
export function noteHallOfFameFailure(provider: string, error: unknown, now = Date.now()): void {
  const category = errorCategory(error);
  if (category === "rate_limited") {
    coolUntil.set(provider, now + HALL_OF_FAME_RATE_LIMIT_COOL_MS);
    return;
  }
  if (category === "timeout") {
    const count = (consecutiveTimeouts.get(provider) ?? 0) + 1;
    consecutiveTimeouts.set(provider, count);
    if (count >= 2) {
      coolUntil.set(provider, now + HALL_OF_FAME_TIMEOUT_COOL_MS);
      consecutiveTimeouts.delete(provider);
    }
  }
}
export function noteHallOfFameSuccess(provider: string): void {
  consecutiveTimeouts.delete(provider);
  coolUntil.delete(provider);
}
/** Test helper. */
export function resetHallOfFameCooldowns(): void {
  coolUntil.clear();
  consecutiveTimeouts.clear();
}

/** Per-member time limit: free models routinely need 15-40s for a full answer. */
export const HALL_OF_FAME_MEMBER_MS_DEFAULT = 45_000;

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
  const queue = [...squad];
  const deferred = new Map<object, number>();
  while (queue.length) {
    const member = queue.shift()!;
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
    if (durableProviderResting(member.provider) || hallOfFameProviderCooling(member.provider)) {
      deadProviders.add(member.provider);
      continue;
    }
    // Busy provider: try the next member now and come back to this one later
    // (at most twice, after a short pause) instead of piling onto its limit.
    if (hallOfFameProviderBusy(member.provider)) {
      const seen = deferred.get(member) ?? 0;
      if (seen < 2) {
        deferred.set(member, seen + 1);
        queue.push(member);
        if (queue.every((m) => hallOfFameProviderBusy(m.provider))) await new Promise((r) => setTimeout(r, 750));
        continue;
      }
    }
    enter(member.provider);
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
          timeoutMs: Math.min(remainingMs, positiveEnvInt("HALL_OF_FAME_MEMBER_MS", HALL_OF_FAME_MEMBER_MS_DEFAULT)),
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
        noteHallOfFameSuccess(member.provider);
        finish(`${member.provider} · ${member.model}`);
        return { ok: true, text, provider: member.provider, model: member.model, attempts };
      }
    } catch (error) {
      const latencyMs = Date.now() - started;
      recordFreeModelOutcome({ provider: member.provider, model: member.model, ok: false, latencyMs });
      noteHallOfFameFailure(member.provider, error);
      if (providerWideFailure(error)) deadProviders.add(member.provider);
      attempts.push({
        provider: member.provider,
        model: member.model,
        ok: false,
        detail: error instanceof Error ? error.message.slice(0, 160) : "call failed",
        latencyMs,
      });
    } finally {
      leave(member.provider);
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
  // A cancelled build never reaches a paid provider.
  if (request.signal?.aborted)
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
  const promptChars = request.system.length + request.user.length;
  // Priced from the ESTIMATED per-model table (model-prices.ts): the walk may
  // be answered by any paid roster model, so the reservation covers the most
  // expensive one, never less than the tier's own estimate.
  const estimate = Math.max(
    estimateMicrocents(promptChars, maxOutputTokens, tier),
    rosterEstimateMicrocents(paidRosterFor(roleForPurpose(request.purpose), request.preferModels), promptChars, maxOutputTokens),
  );
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
        { role: "user" as const, content: request.user },
      ],
      paidOnly: true,
      ...(request.preferModels?.length ? { preferModels: request.preferModels } : {}),
      ...(request.avoidModels?.length ? { avoidModels: request.avoidModels } : {}),
      maxOutputTokens,
      // One thinker step gets a bounded share of the build's wall-clock, not
      // the router's whole six-minute chain budget.
      chainDeadlineMs: 300_000,
    };
    const lane = {
      budgetReservedExternally: true,
      ...(request.signal ? { signal: request.signal } : {}),
    };
    const outcome =
      request.json === true
        ? await generateStructuredOutput(caller, aiRequest, lane)
        : await generateText(caller, aiRequest, lane);
    const text = outcome.text.trim();
    // The answering model's estimated price, so a Claude Opus answer is
    // charged at Opus rates against the daily cap, not at a tier average.
    const billed =
      outcome.usage.inputTokens === null && outcome.usage.outputTokens === null
        ? estimate
        : modelCostMicrocents(
            outcome.model,
            outcome.usage.inputTokens ?? Math.ceil(promptChars / 4),
            outcome.usage.outputTokens ?? 0,
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
  // Paid runs for the hardest steps within the daily cap (owner's choice);
  // everything else, an explicit free-only flag, or a free-only spending scope
  // (demo workspace builds) stays on the free pool.
  const strictFreeOnly = scopedFreeOnly() || !paidCollectiveAllowed(request.purpose);
  const paid: PaidThinkerOutcome = strictFreeOnly
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
    : await callPaidThinker(request);
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
