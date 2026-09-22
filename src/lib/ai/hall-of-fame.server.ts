/**
 * THE HALL OF FAME RUNNER — the platform never stops building.
 *
 * `luna.server.ts` owns the paid lanes (Sol, Terra, Luna) and their monthly
 * spend cap. The moment a paid lane is off, out of budget, rate limited or
 * unreachable, this module takes the SAME piece of thinking to Revora's free
 * model pool and works down an ordered squad of the strongest capable models
 * until one answers usefully.
 *
 * Guarantees kept here:
 *
 *  - Zero cost. Every attempt goes through the router's pinned free-model
 *    entry point, so the free-eligibility gate, the daily allowance, the
 *    circuit breaker and the telemetry all still apply. No paid model and no
 *    unverified model can be reached from here.
 *  - No silent rubbish. An empty answer, or a JSON job answered in the wrong
 *    shape, counts as that model failing; the next model in the squad is tried.
 *  - Honest failure. When the whole squad cannot answer, the caller is told so
 *    and reports it to the owner. Nothing generic or templated is substituted.
 *
 * Server-only.
 */

import type { CollectivePurpose, CollectiveTier, TaskComplexity } from "@/lib/ai/collective";
import {
  DEFAULT_SQUAD_SIZE,
  capabilityForPurpose,
  rankHallOfFame,
  roleForPurpose,
  type HallOfFameCandidate,
} from "@/lib/ai/hall-of-fame";
import { callCollective, type LunaSkipReason } from "@/lib/ai/luna.server";

export type HallOfFameAttempt = {
  provider: string;
  model: string;
  ok: boolean;
  /** Short, safe reason. Never a prompt, never customer content. */
  detail: string | null;
  latencyMs: number;
};

export type HallOfFameRun = {
  at: number;
  purpose: CollectivePurpose;
  capability: string;
  squadSize: number;
  attempts: HallOfFameAttempt[];
  /** The model that carried the job, or null when the squad could not. */
  answeredBy: string | null;
  /** Why the paid lane handed over, when it was tried at all. */
  paidReason: string | null;
};

const RUNS: HallOfFameRun[] = [];
const MAX_RUNS = 40;

function recordRun(run: HallOfFameRun) {
  RUNS.unshift(run);
  if (RUNS.length > MAX_RUNS) RUNS.length = MAX_RUNS;
}

/** Recent stand-in work, for the admin surface. Contains no customer content. */
export function recentHallOfFameRuns(limit = 20): HallOfFameRun[] {
  return RUNS.slice(0, Math.max(limit, 0));
}

export function resetHallOfFameRuns() {
  RUNS.length = 0;
}

export type HallOfFameOutcome =
  | {
      ok: true;
      text: string;
      provider: string;
      model: string;
      attempts: HallOfFameAttempt[];
    }
  | {
      ok: false;
      reason: "no_free_model" | "squad_exhausted";
      detail: string | null;
      attempts: HallOfFameAttempt[];
    };

/** Builds the live squad for one purpose from the free-model registry. */
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
    candidates = registry.map((entry) => ({
      provider: entry.provider,
      model: entry.model,
      capabilities: entry.capabilities,
      weight: entry.weight,
      healthy: entry.health.healthy,
      remainingToday: entry.quota.remainingToday,
    }));
  } catch {
    // A provider catalogue being unreachable means a shorter squad, not a crash.
  }
  return { role, capability, squad: rankHallOfFame({ purpose, candidates, squadSize }) };
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
  /** Recorded on the run so the admin can see why the paid lane handed over. */
  paidReason?: string | null;
};

/**
 * Takes one piece of thinking to the free pool, strongest capable model first.
 * Never throws: an exhausted squad is reported, not raised.
 */
export async function callHallOfFame(request: HallOfFameRequest): Promise<HallOfFameOutcome> {
  const { callPinnedFreeModel } = await import("@/lib/ai/router.server");
  const { role, capability, squad } = await hallOfFameSquad(
    request.purpose,
    request.squadSize ?? DEFAULT_SQUAD_SIZE,
  );
  const attempts: HallOfFameAttempt[] = [];

  if (!squad.length) {
    recordRun({
      at: Date.now(),
      purpose: request.purpose,
      capability,
      squadSize: 0,
      attempts,
      answeredBy: null,
      paidReason: request.paidReason ?? null,
    });
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
          ...(request.maxOutputTokens === undefined
            ? {}
            : { maxOutputTokens: request.maxOutputTokens }),
        },
      );
      const text = result.text.trim();
      const usable = text.length > 0 && (request.json !== true || result.data !== null);
      attempts.push({
        provider: member.provider,
        model: member.model,
        ok: usable,
        detail: usable ? null : "answer could not be used",
        latencyMs: result.latencyMs,
      });
      if (usable) {
        recordRun({
          at: Date.now(),
          purpose: request.purpose,
          capability,
          squadSize: squad.length,
          attempts,
          answeredBy: `${member.provider} · ${member.model}`,
          paidReason: request.paidReason ?? null,
        });
        return { ok: true, text, provider: member.provider, model: member.model, attempts };
      }
    } catch (error) {
      attempts.push({
        provider: member.provider,
        model: member.model,
        ok: false,
        detail: error instanceof Error ? error.message.slice(0, 160) : "call failed",
        latencyMs: Date.now() - started,
      });
    }
  }

  recordRun({
    at: Date.now(),
    purpose: request.purpose,
    capability,
    squadSize: squad.length,
    attempts,
    answeredBy: null,
    paidReason: request.paidReason ?? null,
  });
  return {
    ok: false,
    reason: "squad_exhausted",
    detail: `${attempts.length} free model(s) tried, none could answer`,
    attempts,
  };
}

/* --------------------------- the single front door -------------------------- */

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
      /** Free stand-ins tried, in order. Empty when the paid lane answered. */
      attempts: HallOfFameAttempt[];
      /** Why the paid lane handed over, when it did. */
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

/**
 * THE call every builder step makes for real thinking.
 *
 * Paid first when it is genuinely available, because Sol and Terra are the
 * quality ceiling. The instant the paid lane cannot serve — switched off, out
 * of monthly budget, rate limited, unreachable or answering unusably — the same
 * job goes to the Hall of Fame free squad. Only when both are exhausted does
 * this report failure, and the caller then tells the owner plainly.
 */
export async function callBestThinker(request: {
  purpose: CollectivePurpose;
  system: string;
  user: string;
  complexity?: TaskComplexity;
  organizationId?: string | null;
  userId?: string | null;
  maxOutputTokens?: number;
  json?: boolean;
  signal?: AbortSignal;
}): Promise<ThinkerOutcome> {
  const paid = await callCollective({
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
      ok: true,
      lane: "paid",
      tier: paid.tier,
      wanted: paid.wanted,
      downgraded: paid.downgraded,
      text: paid.text,
      model: paid.model,
      costMicrocents: paid.costMicrocents,
      attempts: [],
      handoverReason: null,
    };
  }

  const handoverReason = paid.detail ? `${paid.reason}: ${paid.detail}` : paid.reason;
  const free = await callHallOfFame({
    purpose: request.purpose,
    system: request.system,
    user: request.user,
    ...(request.json === undefined ? {} : { json: request.json }),
    ...(request.maxOutputTokens === undefined ? {} : { maxOutputTokens: request.maxOutputTokens }),
    ...(request.organizationId === undefined ? {} : { organizationId: request.organizationId }),
    ...(request.userId === undefined ? {} : { userId: request.userId }),
    paidReason: handoverReason,
  });

  if (free.ok) {
    return {
      ok: true,
      lane: "free",
      tier: null,
      wanted: paid.wanted,
      downgraded: true,
      text: free.text,
      model: `${free.provider} · ${free.model}`,
      costMicrocents: 0,
      attempts: free.attempts,
      handoverReason,
    };
  }

  return {
    ok: false,
    lane: "free",
    tier: paid.tier,
    wanted: paid.wanted,
    reason: free.reason,
    detail: free.detail,
    attempts: free.attempts,
    handoverReason,
  };
}
