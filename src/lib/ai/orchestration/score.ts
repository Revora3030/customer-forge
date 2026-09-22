/**
 * QUALITY-FIRST ROUTING SCORE.
 *
 * Revora used to prefer whichever model was free. It no longer does. A model is
 * ranked by what it can actually do for the exact task, in this fixed order of
 * precedence:
 *
 *   1. capability fit
 *   2. compatibility with the required interface / output contract / tools
 *   3. verified quality
 *   4. reliability and recent health
 *   5. context and output headroom
 *   6. modality fit
 *   7. safety / policy compatibility
 *   8. latency suitability
 *   9. cost
 *
 * The order is enforced structurally, not by hand-tuned weights: each criterion
 * occupies its own decimal band, so a better score on a higher criterion can
 * never be outbid by every lower criterion combined. Cost occupies the last,
 * smallest band, so "it is free" can only ever break a tie between models that
 * are otherwise equal.
 *
 * Pure and deterministic, so the policy is fully unit-testable.
 */

import type {
  Capability,
  ModelRecord,
  TaskContract,
} from "@/lib/ai/orchestration/contracts";
import { missingCapabilities, supports } from "@/lib/ai/orchestration/contracts";

export const CRITERIA = [
  "capability_fit",
  "compatibility",
  "quality",
  "reliability",
  "context_fit",
  "modality_fit",
  "safety",
  "latency",
  "cost",
] as const;

export type Criterion = (typeof CRITERIA)[number];

/** Descending weights, one order of magnitude apart per criterion. */
const WEIGHT: Record<Criterion, number> = {
  capability_fit: 1e8,
  compatibility: 1e7,
  quality: 1e6,
  reliability: 1e5,
  context_fit: 1e4,
  modality_fit: 1e3,
  safety: 1e2,
  latency: 1e1,
  cost: 1e0,
};

export type ScoreBreakdown = Record<Criterion, number>;

export type Rejection =
  | { kind: "missing_capability"; capabilities: Capability[] }
  | { kind: "modality_mismatch"; detail: string }
  | { kind: "schema_incompatible" }
  | { kind: "context_too_small"; contextTokens: number | null }
  | { kind: "blocked"; detail: string }
  | { kind: "unhealthy" };

export type Scored = {
  record: ModelRecord;
  eligible: boolean;
  score: number;
  breakdown: ScoreBreakdown;
  /** Present exactly when `eligible` is false. */
  rejection: Rejection | null;
  /** One sentence for the explainability record. */
  reason: string;
};

function normalized(value: number) {
  return Math.max(0, Math.min(1, value));
}

function modalityFit(record: ModelRecord, contract: TaskContract) {
  const input = record.inputModalities.includes(contract.inputModality);
  const output = record.outputModalities.includes(contract.outputModality);
  return { input, output, fit: (input ? 0.5 : 0) + (output ? 0.5 : 0) };
}

function contextFit(record: ModelRecord, contract: TaskContract) {
  if (contract.minContextTokens <= 0) return 1;
  if (record.contextTokens === null) return 0.5; // unknown, not disqualifying
  return normalized(record.contextTokens / Math.max(contract.minContextTokens, 1)) ;
}

function latencyFit(record: ModelRecord, contract: TaskContract) {
  if (record.latencyMs === null) return 0.5;
  if (record.latencyMs <= 0) return 1;
  return normalized(1 - record.latencyMs / Math.max(contract.latencyBudgetMs, 1));
}

/**
 * Cost occupies the lowest band and is expressed as "cheaper is slightly
 * better". It never gates eligibility, and a free model gets no bonus beyond
 * this band — being free is worth less than one point of reliability.
 */
function costFit(record: ModelRecord) {
  if (record.costPerMTok === null) return record.paid ? 0.4 : 0.6;
  return normalized(1 - record.costPerMTok / 50);
}

export function scoreCandidate(contract: TaskContract, record: ModelRecord): Scored {
  const missing = missingCapabilities(record, contract.required);
  const modality = modalityFit(record, contract);
  const context = contextFit(record, contract);
  const schemaOk = !contract.schemaBound || supports(record, "structured_output");
  const preferredHit = contract.preferred.filter((capability) =>
    supports(record, capability),
  ).length;
  const preferredFit =
    contract.preferred.length === 0 ? 1 : preferredHit / contract.preferred.length;

  const breakdown: ScoreBreakdown = {
    capability_fit: missing.length === 0 ? 1 : 0,
    compatibility: (schemaOk ? 0.7 : 0) + 0.3 * preferredFit,
    quality: normalized(record.quality / 100),
    reliability: normalized(record.reliability / 100) * (record.healthy ? 1 : 0.2),
    context_fit: context,
    modality_fit: modality.fit,
    safety: record.blockedReason ? 0 : record.sensitiveSafe === false ? 0.5 : 1,
    latency: latencyFit(record, contract),
    cost: costFit(record),
  };

  let rejection: Rejection | null = null;
  if (record.blockedReason) rejection = { kind: "blocked", detail: record.blockedReason };
  else if (missing.length > 0) rejection = { kind: "missing_capability", capabilities: missing };
  else if (!modality.input || !modality.output)
    rejection = {
      kind: "modality_mismatch",
      detail: `needs ${contract.inputModality}->${contract.outputModality}`,
    };
  else if (!schemaOk) rejection = { kind: "schema_incompatible" };
  else if (
    contract.minContextTokens > 0 &&
    record.contextTokens !== null &&
    record.contextTokens < contract.minContextTokens
  )
    rejection = { kind: "context_too_small", contextTokens: record.contextTokens };
  else if (!record.healthy) rejection = { kind: "unhealthy" };

  const score = CRITERIA.reduce(
    (total, criterion) => total + WEIGHT[criterion] * normalized(breakdown[criterion]),
    0,
  );

  return {
    record,
    eligible: rejection === null,
    score: Math.round(score),
    breakdown,
    rejection,
    reason: rejection === null ? selectedReason(record, breakdown) : rejectionReason(rejection),
  };
}

function selectedReason(record: ModelRecord, breakdown: ScoreBreakdown) {
  return `covers every required capability; quality ${Math.round(breakdown.quality * 100)}, reliability ${Math.round(
    breakdown.reliability * 100,
  )}, ${record.paid ? "paid" : "no cost"} (cost considered last)`;
}

export function rejectionReason(rejection: Rejection): string {
  switch (rejection.kind) {
    case "missing_capability":
      return `does not provide ${rejection.capabilities.join(", ")}`;
    case "modality_mismatch":
      return `wrong modality: ${rejection.detail}`;
    case "schema_incompatible":
      return "cannot be trusted to return the required structured output";
    case "context_too_small":
      return `context window ${rejection.contextTokens ?? "unknown"} is too small for this task`;
    case "blocked":
      return `blocked right now: ${rejection.detail}`;
    case "unhealthy":
      return "recent failures make it unsafe to route to";
  }
}

export type Ranking = {
  eligible: Scored[];
  rejected: Scored[];
};

/**
 * Ranks the whole candidate set. No candidate ceiling is applied here: the
 * number of models that participate is decided by genuine capability need
 * (see `gap.ts`), never by an arbitrary top-N cut.
 */
export function rankCandidates(contract: TaskContract, records: ModelRecord[]): Ranking {
  const scored = records.map((record) => scoreCandidate(contract, record));
  const eligible = scored
    .filter((entry) => entry.eligible)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.record.specialist) - Number(a.record.specialist) ||
        a.record.id.localeCompare(b.record.id),
    );
  const rejected = scored
    .filter((entry) => !entry.eligible)
    .sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
  return { eligible, rejected };
}
