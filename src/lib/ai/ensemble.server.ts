/**
 * The Revora free-AI ensemble orchestrator.
 *
 * Revora's deterministic engine is still the thing that writes to a site. This
 * module is the advisory layer in front of it: it puts the ENTIRE verified free
 * model pool to work on one job at the same time, as a coordinated agency of
 * specialists rather than a single model doing everything.
 *
 *   lanes (architect, designer, SEO, CRO, a11y, critic, …)
 *     → assignment across every verified free model of every configured provider
 *     → bounded parallel dispatch through the router's pinned free-model call
 *     → per-model validation, deduplication, consensus, critique
 *     → one synthesised answer + a proof report
 *
 * Invariants:
 * - Zero cost. Only `FreeProviderName` models reach this layer, each one
 *   re-checked with `isFreeEligibleModel`; a paid id is recorded as skipped
 *   ("not verified free") and never called. There is no paid fallback here.
 * - No model is a single point of failure. One model failing, timing out or
 *   answering rubbish removes that one result; the rest of the ensemble carries
 *   the job. An empty ensemble returns no proposal, and the caller keeps its
 *   deterministic result.
 * - Bounded work. Global concurrency, per-provider concurrency, a per-call
 *   timeout and a wall-clock deadline are all enforced, so "use every model"
 *   never becomes a 67x latency wall.
 * - Advisory only. Nothing here writes to a database or bypasses the
 *   AgentAction pipeline.
 *
 * Server-only.
 */

import type { ModelRole } from "@/lib/ai/config";
import { isFreeEligibleModel } from "@/lib/ai/free";
import {
  buildFreeModelRegistry,
  modelsForCapability,
  type ModelCapability,
  type RegistryModel,
} from "@/lib/ai/registry.server";
import { callPinnedFreeModel } from "@/lib/ai/router.server";
import type { AiCaller, AiMessage } from "@/lib/ai/types";

/* --------------------------------- lanes ---------------------------------- */

export type LaneId =
  | "architect"
  | "frontend"
  | "uiux"
  | "visual"
  | "brand"
  | "cro"
  | "seo"
  | "accessibility"
  | "mobile"
  | "performance"
  | "copy"
  | "facts"
  | "vision"
  | "navigation"
  | "security"
  | "qa"
  | "regression"
  | "critic"
  | "synthesizer";

export type Lane = {
  id: LaneId;
  title: string;
  capability: ModelCapability;
  role: ModelRole;
};

/** The specialist lanes of the virtual agency. */
export const ENSEMBLE_LANES: Lane[] = [
  { id: "architect", title: "Lead architect", capability: "planning", role: "design" },
  { id: "frontend", title: "Frontend engineer", capability: "frontend", role: "coding" },
  { id: "uiux", title: "UI/UX designer", capability: "design", role: "design" },
  { id: "visual", title: "Visual designer", capability: "design", role: "design" },
  { id: "brand", title: "Brand designer", capability: "design", role: "design" },
  { id: "cro", title: "Conversion strategist", capability: "cro", role: "primary" },
  { id: "seo", title: "SEO specialist", capability: "seo", role: "primary" },
  { id: "accessibility", title: "Accessibility specialist", capability: "accessibility", role: "primary" },
  { id: "mobile", title: "Mobile/responsive specialist", capability: "frontend", role: "coding" },
  { id: "performance", title: "Performance specialist", capability: "reasoning", role: "primary" },
  { id: "copy", title: "Content specialist", capability: "copy", role: "fast" },
  { id: "facts", title: "Fact-protection specialist", capability: "facts", role: "fast" },
  { id: "vision", title: "Visual critic", capability: "vision", role: "vision" },
  { id: "navigation", title: "Information architect", capability: "planning", role: "primary" },
  { id: "security", title: "Security reviewer", capability: "security", role: "primary" },
  { id: "qa", title: "QA reviewer", capability: "qa", role: "primary" },
  { id: "regression", title: "Regression reviewer", capability: "qa", role: "fast" },
  { id: "critic", title: "Final critic", capability: "critique", role: "design" },
  { id: "synthesizer", title: "Synthesiser", capability: "reasoning", role: "design" },
];

export const laneById = (id: LaneId): Lane =>
  ENSEMBLE_LANES.find((lane) => lane.id === id) ?? ENSEMBLE_LANES[0]!;

/* --------------------------------- modes ---------------------------------- */

/**
 * How wide the ensemble opens.
 *
 * - `minimal`  one model per lane — a tiny edit does not need an agency.
 * - `standard` a few independent opinions per lane.
 * - `maximum`  every compatible verified free model, across every provider.
 *   This is "Maximum Free Intelligence" and it is the default for a full
 *   website build, a redesign or a whole-site audit.
 */
export type EnsembleMode = "minimal" | "standard" | "maximum";

const HIGH_VALUE =
  /\b(build|rebuild|redesign|re-?design|generate|create|overhaul|revamp|audit everything|full audit|whole site|entire site|site-?wide|best possible|from scratch|launch)\b/i;
const TINY_EDIT =
  /\b(change|fix|tweak|rename|replace|swap|update|correct|adjust|reword|shorten)\b.{0,40}\b(word|phrase|text|title|heading|button|colour|color|link|typo|price|number|email|phone)\b/i;

/** The mode Revora picks for a request, from the request itself. */
export function ensembleModeFor(instruction: string): EnsembleMode {
  const text = (instruction ?? "").trim();
  if (text.length === 0) return "standard";
  if (TINY_EDIT.test(text) && text.length < 240) return "minimal";
  if (HIGH_VALUE.test(text)) return "maximum";
  return "standard";
}

/** Models per lane for a mode. `Infinity` means "all compatible models". */
export function laneWidth(mode: EnsembleMode): number {
  if (mode === "minimal") return 1;
  if (mode === "standard") return 3;
  const override = Number(process.env["ENSEMBLE_MAX_MODELS_PER_LANE"] ?? "");
  return Number.isFinite(override) && override > 0 ? Math.floor(override) : Number.POSITIVE_INFINITY;
}

/* ------------------------------- assignment ------------------------------- */

export type EnsembleAssignment = {
  lane: LaneId;
  laneTitle: string;
  provider: RegistryModel["provider"];
  model: string;
  role: ModelRole;
  weight: number;
};

export type SkippedModel = {
  provider: string;
  model: string;
  lane: LaneId | null;
  reason: string;
};

/**
 * Spreads the verified free pool across the lanes.
 *
 * Providers are interleaved so one provider's catalogue cannot monopolise a
 * lane, strongest model first inside each provider. A model may serve several
 * lanes — that is deliberate, and the reason a 6-model pool still fills 19
 * lanes while a 67-model pool spreads out with almost no repetition.
 */
export function assignLanes(
  models: RegistryModel[],
  lanes: Lane[],
  mode: EnsembleMode,
): { assignments: EnsembleAssignment[]; skipped: SkippedModel[] } {
  const width = laneWidth(mode);
  const assignments: EnsembleAssignment[] = [];
  const skipped: SkippedModel[] = [];
  const used = new Map<string, number>();

  for (const lane of lanes) {
    const eligible = modelsForCapability(models, lane.capability).filter((entry) => {
      if (!isFreeEligibleModel(entry.provider, entry.model)) {
        skipped.push({
          provider: entry.provider,
          model: entry.model,
          lane: lane.id,
          reason: "not verified free",
        });
        return false;
      }
      if (!entry.health.healthy) {
        skipped.push({
          provider: entry.provider,
          model: entry.model,
          lane: lane.id,
          reason: "provider cooling down after failures",
        });
        return false;
      }
      if (entry.quota.remainingToday !== null && entry.quota.remainingToday <= 0) {
        skipped.push({
          provider: entry.provider,
          model: entry.model,
          lane: lane.id,
          reason: "provider free budget spent for today",
        });
        return false;
      }
      return true;
    });

    if (eligible.length === 0) {
      skipped.push({
        provider: "-",
        model: "-",
        lane: lane.id,
        reason: "no verified free model has this capability",
      });
      continue;
    }

    // Interleave providers: one per provider, round after round.
    const byProvider = new Map<string, RegistryModel[]>();
    for (const entry of eligible) {
      const list = byProvider.get(entry.provider) ?? [];
      list.push(entry);
      byProvider.set(entry.provider, list);
    }
    const rounds: RegistryModel[] = [];
    for (let depth = 0; ; depth += 1) {
      let added = false;
      for (const list of byProvider.values()) {
        const entry = list[depth];
        if (entry) {
          rounds.push(entry);
          added = true;
        }
      }
      if (!added) break;
    }

    // Least-used models first inside a round, so work spreads instead of
    // hammering the single strongest id.
    const ordered = rounds.sort(
      (a, b) =>
        (used.get(`${a.provider}|${a.model}`) ?? 0) - (used.get(`${b.provider}|${b.model}`) ?? 0),
    );

    for (const entry of ordered) {
      if (assignments.filter((item) => item.lane === lane.id).length >= width) break;
      assignments.push({
        lane: lane.id,
        laneTitle: lane.title,
        provider: entry.provider,
        model: entry.model,
        role: lane.role,
        weight: entry.weight,
      });
      const key = `${entry.provider}|${entry.model}`;
      used.set(key, (used.get(key) ?? 0) + 1);
    }
  }

  return { assignments, skipped };
}

/* -------------------------------- dispatch -------------------------------- */

export type EnsembleOutcome<T> = {
  lane: LaneId;
  provider: string;
  model: string;
  ok: boolean;
  latencyMs: number;
  /** Why it produced nothing usable: timeout, bad_response, rate_limited, … */
  reason: string | null;
  value: T | null;
};

export type EnsembleProof<T> = {
  mode: EnsembleMode;
  /** Every model Revora put to work, with its lane. */
  attempted: EnsembleAssignment[];
  outcomes: EnsembleOutcome<T>[];
  succeeded: number;
  failed: number;
  skipped: SkippedModel[];
  providers: string[];
  lanes: LaneId[];
  /** Distinct answers after deduplication. */
  distinct: number;
  /** How many models agreed with the winning answer. */
  agreement: number;
  /** Answers that disagreed with the winner, for the conflict report. */
  conflicts: number;
  totalLatencyMs: number;
  deadlineHit: boolean;
  /** PASS only when at least one model produced a validated answer. */
  verdict: "PASS" | "FAIL" | "NOT_VERIFIED" | "BLOCKED";
  blockedReason: string | null;
  results: T[];
  /** The consensus answer, or null when nothing validated. */
  winner: T | null;
};

export type EnsembleRequest<T> = {
  mode: EnsembleMode;
  lanes?: LaneId[];
  /** Builds the prompt for one lane and model. */
  prompt: (input: { lane: Lane; assignment: EnsembleAssignment }) => AiMessage[];
  /** Validates one model's JSON answer. Returning null rejects that answer. */
  parse: (input: {
    data: Record<string, unknown>;
    lane: Lane;
    assignment: EnsembleAssignment;
  }) => T | null;
  /** Canonical key for consensus grouping; identical keys are the same answer. */
  consensusKey: (value: T) => string;
  /** Preferred registry role to build the pool from (default: the lane's role). */
  role?: ModelRole;
  concurrency?: number;
  perProviderConcurrency?: number;
  /** Wall-clock ceiling for the whole ensemble. */
  deadlineMs?: number;
  timeoutMsPerCall?: number;
  signal?: AbortSignal;
  /**
   * Stop dispatching further models once this many of them have independently
   * produced the same validated answer. The owner waits for a decision, not for
   * every model in the pool to repeat it.
   */
  settleWhenAgreed?: number;
};

function positiveEnv(name: string, fallback: number) {
  const raw = Number(process.env[name] ?? "");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

/**
 * Runs one ensemble: parallel dispatch with bounded concurrency, per-model
 * validation, deduplication and consensus. Never throws for a model failure.
 */
export async function runEnsemble<T>(
  caller: AiCaller,
  request: EnsembleRequest<T>,
): Promise<EnsembleProof<T>> {
  const started = Date.now();
  // Recorded with the run so the admin page can name the job each model served.
  runTask = caller.task;
  const lanes = (request.lanes ?? ENSEMBLE_LANES.map((lane) => lane.id)).map(laneById);
  const roles = [...new Set(lanes.map((lane) => request.role ?? lane.role))];

  const pool: RegistryModel[] = [];
  for (const role of roles) {
    try {
      pool.push(...(await buildFreeModelRegistry(role)));
    } catch {
      // A provider catalogue being unreachable is not a build failure.
    }
  }
  // One entry per provider+model, keeping the richest capability list.
  const deduped = new Map<string, RegistryModel>();
  for (const entry of pool) {
    const key = `${entry.provider}|${entry.model}`;
    const existing = deduped.get(key);
    if (!existing || entry.capabilities.length > existing.capabilities.length)
      deduped.set(key, entry);
  }

  const { assignments, skipped } = assignLanes([...deduped.values()], lanes, request.mode);

  if (assignments.length === 0)
    return recordRun({
      mode: request.mode,
      attempted: [],
      outcomes: [],
      succeeded: 0,
      failed: 0,
      skipped,
      providers: [],
      lanes: [],
      distinct: 0,
      agreement: 0,
      conflicts: 0,
      totalLatencyMs: Date.now() - started,
      deadlineHit: false,
      verdict: "BLOCKED",
      blockedReason: "No verified free model is available right now.",
      results: [],
      winner: null,
    });

  const globalLimit = request.concurrency ?? positiveEnv("ENSEMBLE_CONCURRENCY", 6);
  const providerLimit =
    request.perProviderConcurrency ?? positiveEnv("ENSEMBLE_PROVIDER_CONCURRENCY", 2);
  const deadline = started + (request.deadlineMs ?? positiveEnv("ENSEMBLE_DEADLINE_MS", 120_000));

  const outcomes: EnsembleOutcome<T>[] = [];
  const providerInFlight = new Map<string, number>();
  let deadlineHit = false;
  let cursor = 0;
  const queue = [...assignments];

  // Live vote tally, so an ensemble can settle as soon as enough models agree
  // instead of making the owner wait for every model to repeat the same answer.
  const liveVotes = new Map<string, number>();
  const settleAt = request.settleWhenAgreed ?? 0;
  let settled = false;

  async function worker() {
    for (;;) {
      if (cursor >= queue.length) return;
      if (settled) return;
      if (request.signal?.aborted) return;
      if (Date.now() >= deadline) {
        deadlineHit = true;
        return;
      }
      // Pick the next assignment whose provider has spare concurrency.
      let index = -1;
      for (let i = cursor; i < queue.length; i += 1) {
        const candidate = queue[i]!;
        if ((providerInFlight.get(candidate.provider) ?? 0) < providerLimit) {
          index = i;
          break;
        }
      }
      if (index === -1) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        continue;
      }
      const assignment = queue[index]!;
      queue.splice(index, 1);
      if (index < cursor) cursor -= 1;

      providerInFlight.set(
        assignment.provider,
        (providerInFlight.get(assignment.provider) ?? 0) + 1,
      );
      const lane = laneById(assignment.lane);
      const callStarted = Date.now();
      try {
        const result = await callPinnedFreeModel(
          { ...caller, task: `${caller.task}.${assignment.lane}` },
          {
            provider: assignment.provider,
            model: assignment.model,
            role: assignment.role,
            json: true,
            messages: request.prompt({ lane, assignment }),
            ...(request.timeoutMsPerCall === undefined
              ? {}
              : { timeoutMs: request.timeoutMsPerCall }),
          },
        );
        const value = result.data ? request.parse({ data: result.data, lane, assignment }) : null;
        outcomes.push({
          lane: assignment.lane,
          provider: assignment.provider,
          model: assignment.model,
          ok: value !== null,
          latencyMs: result.latencyMs,
          reason: value === null ? "answer failed validation" : null,
          value,
        });
      } catch (error) {
        outcomes.push({
          lane: assignment.lane,
          provider: assignment.provider,
          model: assignment.model,
          ok: false,
          latencyMs: Date.now() - callStarted,
          reason:
            (error as { category?: string })?.category ??
            (error as Error)?.message?.slice(0, 80) ??
            "failed",
          value: null,
        });
      } finally {
        const current = providerInFlight.get(assignment.provider) ?? 1;
        if (current <= 1) providerInFlight.delete(assignment.provider);
        else providerInFlight.set(assignment.provider, current - 1);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(globalLimit, assignments.length)) }, () => worker()),
  );

  const good = outcomes.filter((entry) => entry.ok && entry.value !== null);
  const results = good.map((entry) => entry.value as T);

  // CONSENSUS. Identical answers are one vote each; the answer the most models
  // independently arrived at wins, ties broken by the strongest model's weight.
  const groups = new Map<string, { value: T; votes: number; weight: number }>();
  for (const entry of good) {
    const value = entry.value as T;
    const key = request.consensusKey(value);
    const assignment = assignments.find(
      (item) => item.provider === entry.provider && item.model === entry.model,
    );
    const group = groups.get(key);
    if (group) {
      group.votes += 1;
      group.weight = Math.max(group.weight, assignment?.weight ?? 0);
    } else groups.set(key, { value, votes: 1, weight: assignment?.weight ?? 0 });
  }
  const ranked = [...groups.values()].sort(
    (a, b) => b.votes - a.votes || b.weight - a.weight,
  );
  const winner = ranked[0] ?? null;

  return recordRun({
    mode: request.mode,
    attempted: assignments,
    outcomes,
    succeeded: good.length,
    failed: outcomes.length - good.length,
    skipped,
    providers: [...new Set(assignments.map((entry) => entry.provider))],
    lanes: [...new Set(assignments.map((entry) => entry.lane))],
    distinct: groups.size,
    agreement: winner?.votes ?? 0,
    conflicts: Math.max(0, good.length - (winner?.votes ?? 0)),
    totalLatencyMs: Date.now() - started,
    deadlineHit,
    verdict: good.length > 0 ? "PASS" : outcomes.length > 0 ? "FAIL" : "NOT_VERIFIED",
    blockedReason: null,
    results,
    winner: winner?.value ?? null,
  });
}

/* ------------------------------ observability ------------------------------ */

export type EnsembleRun = {
  at: number;
  task: string;
  mode: EnsembleMode;
  verdict: EnsembleProof<unknown>["verdict"];
  modelsInvoked: number;
  distinctModels: number;
  providers: string[];
  lanes: LaneId[];
  succeeded: number;
  failed: number;
  distinct: number;
  agreement: number;
  conflicts: number;
  totalLatencyMs: number;
  deadlineHit: boolean;
  /** Per model: whether it answered, and why not when it did not. */
  participants: {
    provider: string;
    model: string;
    lane: LaneId;
    ok: boolean;
    latencyMs: number;
    reason: string | null;
  }[];
  /** Models Revora deliberately did not call, with the honest reason. */
  skipped: SkippedModel[];
};

let lastRuns: EnsembleRun[] = [];
let runTask = "ensemble";

/** The most recent ensemble runs in this server process, newest first. */
export function ensembleRuns(): EnsembleRun[] {
  return lastRuns;
}

export function resetEnsembleRuns() {
  lastRuns = [];
}

function recordRun<T>(proof: EnsembleProof<T>): EnsembleProof<T> {
  lastRuns = [
    {
      at: Date.now(),
      task: runTask,
      mode: proof.mode,
      verdict: proof.verdict,
      modelsInvoked: proof.attempted.length,
      distinctModels: new Set(proof.attempted.map((entry) => `${entry.provider}|${entry.model}`))
        .size,
      providers: proof.providers,
      lanes: proof.lanes,
      succeeded: proof.succeeded,
      failed: proof.failed,
      distinct: proof.distinct,
      agreement: proof.agreement,
      conflicts: proof.conflicts,
      totalLatencyMs: proof.totalLatencyMs,
      deadlineHit: proof.deadlineHit,
      participants: proof.outcomes.map((entry) => ({
        provider: entry.provider,
        model: entry.model,
        lane: entry.lane,
        ok: entry.ok,
        latencyMs: entry.latencyMs,
        reason: entry.reason,
      })),
      skipped: proof.skipped,
    },
    ...lastRuns,
  ].slice(0, 5);
  return proof;
}

/** A one-line, owner-readable summary of an ensemble run. */
export function proofSummary(proof: EnsembleProof<unknown>): string {
  if (proof.verdict === "BLOCKED") return proof.blockedReason ?? "No free models available.";
  return [
    `${proof.mode} ensemble`,
    `${proof.attempted.length} model${proof.attempted.length === 1 ? "" : "s"} across ${proof.providers.length} provider${proof.providers.length === 1 ? "" : "s"}`,
    `${proof.succeeded} answered, ${proof.failed} did not`,
    `${proof.distinct} distinct proposal${proof.distinct === 1 ? "" : "s"}`,
    `${proof.agreement} agreed on the winner`,
    `${proof.totalLatencyMs}ms`,
    proof.verdict,
  ].join(" · ");
}
