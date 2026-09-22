/**
 * ROUTING OBSERVABILITY.
 *
 * Every orchestration decision is recorded so the platform can answer, for any
 * build: which models actually participated, what unique job each one did, and
 * why every other model was not used.
 *
 * Only safe fields are kept: identifiers, capabilities, scores, timings and
 * outcomes. Never prompts, generated content, customer data or credentials.
 */

import type { Capability, TaskKind } from "@/lib/ai/orchestration/contracts";

export type ParticipantRole = "specialist" | "gap_specialist" | "synthesis" | "verification" | "utility";

export type RoutingParticipant = {
  model: string;
  provider: string;
  role: ParticipantRole;
  /** The unique job this model was brought in for. */
  job: string;
  fills: Capability[];
  score: number;
  reason: string;
};

export type RoutingDecision = {
  requestId: string;
  /** Correlation id that is safe to store: an org id, never a person's data. */
  correlationId: string | null;
  at: number;
  task: TaskKind;
  required: Capability[];
  specialistCoverage: { covered: Capability[]; gaps: Capability[]; available: string[] };
  participants: RoutingParticipant[];
  rejected: { model: string; provider: string; reason: string }[];
  unmetCapabilities: Capability[];
  stages: string[];
  confidence: "high" | "medium" | "low";
};

export type CallOutcome = {
  requestId: string;
  task: TaskKind;
  model: string;
  provider: string;
  role: ParticipantRole;
  required: Capability[];
  routingScore: number;
  reasonSelected: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
  ok: boolean;
  validation: "passed" | "failed" | "skipped";
  fallbackChain: string[];
  finalOutcome: "accepted" | "rejected" | "unavailable";
};

const MAX_RING = 200;
const decisions: RoutingDecision[] = [];
const outcomes: CallOutcome[] = [];

export function recordRoutingDecision(decision: RoutingDecision) {
  decisions.unshift(decision);
  if (decisions.length > MAX_RING) decisions.length = MAX_RING;
  // A structured line so the decision is greppable in server logs too. No
  // prompt, content or credential is ever included.
  console.info(
    "[revora-ai-routing]",
    JSON.stringify({
      requestId: decision.requestId,
      task: decision.task,
      participants: decision.participants.map((entry) => `${entry.provider}/${entry.model}:${entry.role}`),
      gaps: decision.specialistCoverage.gaps,
      unmet: decision.unmetCapabilities,
    }),
  );
}

export function recordCallOutcome(outcome: CallOutcome) {
  outcomes.unshift(outcome);
  if (outcomes.length > MAX_RING) outcomes.length = MAX_RING;
}

export function recentRoutingDecisions(limit = 25): RoutingDecision[] {
  return decisions.slice(0, Math.max(0, limit));
}

export function recentCallOutcomes(limit = 50): CallOutcome[] {
  return outcomes.slice(0, Math.max(0, limit));
}

export function resetRoutingTelemetry() {
  decisions.length = 0;
  outcomes.length = 0;
}

/** Aggregate participation, for "which models built this?" reporting. */
export function participationSummary() {
  const byModel = new Map<
    string,
    { model: string; provider: string; calls: number; failures: number; roles: string[] }
  >();
  for (const outcome of outcomes) {
    const key = `${outcome.provider}/${outcome.model}`;
    const entry =
      byModel.get(key) ??
      { model: outcome.model, provider: outcome.provider, calls: 0, failures: 0, roles: [] };
    entry.calls += 1;
    if (!outcome.ok) entry.failures += 1;
    if (!entry.roles.includes(outcome.role)) entry.roles.push(outcome.role);
    byModel.set(key, entry);
  }
  return [...byModel.values()].sort((a, b) => b.calls - a.calls);
}
