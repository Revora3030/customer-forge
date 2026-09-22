/**
 * THE HALL OF FAME — Revora's free-model relief squad.
 *
 * When the paid lanes (Sol, Terra, Luna) are switched off, out of monthly
 * budget, rate limited or unreachable, the platform must keep building
 * top-tier websites rather than stop. This module decides WHO stands in:
 * it turns the live free-model registry into an ordered squad for one kind
 * of thinking.
 *
 * Rules that make the squad trustworthy rather than a random grab bag:
 *
 *  - CAPABILITY FIRST. A model that cannot serve the job is never picked, so
 *    a reasoning task never lands on a tiny rewrite-only model.
 *  - QUALITY NEXT. Within the capable set, the strongest model goes first.
 *  - HEALTH AND ALLOWANCE. A resting provider or a spent daily allowance
 *    sinks a candidate to the back; it is not silently treated as ready.
 *  - PROVIDER SPREAD. Consecutive attempts prefer different providers, so one
 *    provider's exhausted allowance can never end the whole run.
 *
 * Pure module: no environment, no network, no secrets, fully unit-testable.
 */

import type { CollectivePurpose } from "@/lib/ai/collective";

/** Everything the squad needs to know about one free model. */
export type HallOfFameCandidate = {
  provider: string;
  model: string;
  /** Capability labels from the free-model registry. */
  capabilities: readonly string[];
  /** Rough capability weight (size class), 0-100. */
  weight: number;
  healthy: boolean;
  /** Free calls left today: `null` when the provider publishes no number. */
  remainingToday: number | null;
};

export type HallOfFameRole = "primary" | "design" | "fast" | "coding" | "vision";

/**
 * Which pool a purpose recruits from. Heavy authoring and reasoning work
 * recruits from the primary pool, visual judgement from the vision pool, and
 * short high-volume work from the fast pool.
 */
export function roleForPurpose(purpose: CollectivePurpose): HallOfFameRole {
  switch (purpose) {
    case "visual_review":
      return "vision";
    case "creative_direction":
    case "design_alternative":
      return "design";
    case "intent":
    case "extraction":
    case "classification":
    case "rewrite":
    case "small_edit":
    case "metadata":
      return "fast";
    default:
      return "primary";
  }
}

/** The capability a purpose genuinely needs, named after the job. */
export function capabilityForPurpose(purpose: CollectivePurpose): string {
  switch (purpose) {
    case "creative_direction":
    case "design_alternative":
      return "design";
    case "information_architecture":
    case "conversion_architecture":
    case "page_planning":
    case "hard_request":
    case "synthesis":
      return "planning";
    case "content_strategy":
    case "rewrite":
    case "small_edit":
      return "copy";
    case "seo_analysis":
      return "seo";
    case "visual_review":
      return "vision";
    case "quality_review":
    case "adversarial_review":
    case "plan_review":
    case "specialist_review":
    case "second_opinion":
      return "critique";
    case "repair_priority":
    case "repair_plan":
      return "reasoning";
    case "metadata":
      return "metadata";
    default:
      return "reasoning";
  }
}

/**
 * How many free models are worth lining up for one job. Enough that a whole
 * provider going dark cannot end the run, bounded so a failing job cannot
 * spend an entire day's allowance.
 */
export const DEFAULT_SQUAD_SIZE = 8;

function readiness(candidate: HallOfFameCandidate): number {
  if (!candidate.healthy) return 0;
  if (candidate.remainingToday !== null && candidate.remainingToday <= 0) return 0;
  return 1;
}

/**
 * Builds the ordered squad for one purpose.
 *
 * Candidates that cannot serve the capability are dropped entirely. The rest
 * are ordered ready-first, then strongest-first, and finally spread so that
 * consecutive attempts prefer different providers.
 */
export function rankHallOfFame(input: {
  purpose: CollectivePurpose;
  candidates: readonly HallOfFameCandidate[];
  squadSize?: number;
  /** Optional capability override, for a caller that knows better. */
  capability?: string;
}): HallOfFameCandidate[] {
  const capability = input.capability ?? capabilityForPurpose(input.purpose);
  const capable = input.candidates.filter((candidate) =>
    candidate.capabilities.includes(capability),
  );

  const ordered = capable
    .map((candidate, index) => ({ candidate, index }))
    .sort(
      (a, b) =>
        readiness(b.candidate) - readiness(a.candidate) ||
        b.candidate.weight - a.candidate.weight ||
        a.index - b.index,
    )
    .map((row) => row.candidate);

  return spreadProviders(ordered).slice(0, Math.max(input.squadSize ?? DEFAULT_SQUAD_SIZE, 1));
}

/**
 * Re-orders a ranked list so consecutive entries prefer different providers,
 * without ever promoting a weaker model above a stronger one from a provider
 * that has not been used yet. One provider's spent allowance therefore cannot
 * take out the whole squad.
 */
export function spreadProviders<T extends { provider: string }>(ordered: readonly T[]): T[] {
  const byProvider = new Map<string, T[]>();
  for (const entry of ordered) {
    const bucket = byProvider.get(entry.provider);
    if (bucket) bucket.push(entry);
    else byProvider.set(entry.provider, [entry]);
  }
  const queues = [...byProvider.values()];
  const result: T[] = [];
  while (result.length < ordered.length) {
    let placed = false;
    for (const queue of queues) {
      const next = queue.shift();
      if (next) {
        result.push(next);
        placed = true;
      }
    }
    if (!placed) break;
  }
  return result;
}
