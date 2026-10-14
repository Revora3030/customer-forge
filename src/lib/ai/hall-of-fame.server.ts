/**
 * Task-shaped Hall of Fame execution. Strict free-only mode skips the paid
 * collective entirely. Provider discovery, transport policy and account-level
 * free eligibility remain separate integration and verification requirements.
 */
import { selectTier, type CollectivePurpose, type CollectiveTier, type TaskComplexity } from "@/lib/ai/collective";
import { DEFAULT_SQUAD_SIZE, capabilityForPurpose, rankHallOfFame, roleForPurpose, type HallOfFameCandidate } from "@/lib/ai/hall-of-fame";
import { freeModelForm, recordFreeModelOutcome } from "@/lib/ai/free-reputation";
import { callCollective, type LunaSkipReason } from "@/lib/ai/luna.server";
import { freeAiOnly } from "@/lib/ai/free-only-policy.server";

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
  const strictFreeOnly = freeAiOnly();
  let candidates: HallOfFameCandidate[] = [];
  try {
    const { buildFreeModelRegistry } = await import("@/lib/ai/registry.server");
    const registry = await buildFreeModelRegistry(role);
    candidates = registry
      .filter((entry) => !strictFreeOnly || (entry.provider !== "openai" && entry.provider !== "google"))
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
  squadSize?: number;
  paidReason?: string | null;
  onAttempt?: (provider: string, model: string) => void;
};
export async function callHallOfFame(request: HallOfFameRequest): Promise<HallOfFameOutcome> {
  const { callPinnedFreeModel } = await import("@/lib/ai/router.server");
  const { role, capability, squad } = await hallOfFameSquad(
    request.purpose,
    request.squadSize ?? DEFAULT_SQUAD_SIZE,
  );
  const attempts: HallOfFameAttempt[] = [];
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
          ...(request.json === true ? { json: true } : {}),
          ...(request.maxOutputTokens === undefined ? {} : { maxOutputTokens: request.maxOutputTokens }),
        },
      );
      const text = result.text.trim();
      const usable = text.length > 0 && (request.json !== true || result.data !== null);
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
      attempts.push({
        provider: member.provider,
        model: member.model,
        ok: false,
        detail: error instanceof Error ? error.message.slice(0, 160) : "call failed",
        latencyMs,
      });
    }
  }
  finish(null);
  return {
    ok: false,
    reason: "squad_exhausted",
    detail: `${attempts.length} free model(s) tried, none could answer`,
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
  const strictFreeOnly = freeAiOnly();
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
