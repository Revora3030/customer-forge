/**
 * CAPABILITY-AWARE FAILOVER.
 *
 * When a model fails, Revora does not reach for the cheapest thing still
 * standing. It re-runs the same capability contract and takes the strongest
 * remaining model that can actually satisfy it. When nothing can, the
 * capability is reported unavailable — never quietly substituted by a model
 * that lacks it, and never crossed over into another modality.
 *
 * Pure module.
 */

import type { Capability, ModelRecord, TaskContract } from "@/lib/ai/orchestration/contracts";
import { rankCandidates, type Scored } from "@/lib/ai/orchestration/score";

export type FailoverOutcome =
  | { kind: "substitute"; next: Scored; chain: string[] }
  | { kind: "capability_unavailable"; capability: Capability[]; chain: string[] };

export function capabilityAwareFailover(input: {
  contract: TaskContract;
  /** Models already attempted, in order. */
  attempted: string[];
  catalog: ModelRecord[];
}): FailoverOutcome {
  const remaining = input.catalog.filter((record) => !input.attempted.includes(record.id));
  const ranking = rankCandidates(input.contract, remaining);
  const next = ranking.eligible[0];
  if (next) return { kind: "substitute", next, chain: [...input.attempted, next.record.id] };
  return {
    kind: "capability_unavailable",
    capability: input.contract.required,
    chain: input.attempted,
  };
}
