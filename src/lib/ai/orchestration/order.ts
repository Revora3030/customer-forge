/**
 * QUALITY-FIRST RUNTIME ORDERING.
 *
 * `score.ts` ranks fully normalized catalogue records. This module applies the
 * same precedence to the router's runtime candidate list, where all that is
 * known about a candidate is its id, provider, specialist status, health and
 * whether Revora pays for it.
 *
 * The precedence is identical and structural: capability fit, then quality, then
 * reliability, and cost LAST. A free model can therefore only ever win a tie
 * between candidates that are otherwise equal — "it is free" is never a reason
 * to try a weaker model first.
 *
 * Pure module: no environment, no network, no secrets, fully unit-testable.
 */

import { SPECIALIST_SIX } from "@/lib/ai/orchestration/specialists";

/** Descending bands, one order of magnitude apart, so a higher band can never be outbid. */
const BAND = {
  capability: 1e8,
  quality: 1e6,
  reliability: 1e5,
  cost: 1e0,
} as const;

/**
 * Rough capability weight read off a model id (size class), never off marketing
 * words. Shared with the free-model registry so one heuristic exists.
 */
export function modelQualityWeight(model: string): number {
  const billions = /(\d{2,4})\s*b\b/i.exec(model.replace(/[-_]/g, " "));
  if (billions) {
    const value = Number(billions[1]);
    if (Number.isFinite(value)) return Math.min(100, 30 + value / 6);
  }
  if (/120b|235b|480b|405b/i.test(model)) return 95;
  if (/70b|72b|large|nemotron|maverick/i.test(model)) return 80;
  if (/32b|30b|27b/i.test(model)) return 66;
  if (/flash|lite|mini|small|8b|4b|3b|nano|schnell/i.test(model)) return 40;
  return 50;
}

const SPECIALIST_QUALITY = new Map(SPECIALIST_SIX.map((entry) => [entry.model, entry.quality]));

/** Quality for a runtime candidate: the specialist ceiling, or the id's size class. */
export function candidateQuality(model: string): number {
  return SPECIALIST_QUALITY.get(model) ?? modelQualityWeight(model);
}

export type RuntimeCandidate = {
  /** Model id. */
  model: string;
  provider: string;
  /** False when the candidate cannot serve the required capability at all. */
  capable?: boolean;
  /** Not in a breaker cooldown for this caller/provider/model scope. */
  healthy: boolean;
  /** True when Revora pays per call. Used only as the final tiebreak. */
  paid: boolean;
};

export function candidateScore(candidate: RuntimeCandidate): number {
  const capability = candidate.capable === false ? 0 : 1;
  const quality = candidateQuality(candidate.model) / 100;
  const reliability = candidate.healthy ? 0.9 : 0.18;
  // Cheaper is very slightly better, and nothing more than that.
  const cost = candidate.paid ? 0.4 : 0.6;
  return Math.round(
    BAND.capability * capability +
      BAND.quality * quality +
      BAND.reliability * reliability +
      BAND.cost * cost,
  );
}

/**
 * Orders any candidate list quality-first. Stable for equal scores: the input
 * order (the provider chain's own preference) breaks the final tie, so routing
 * stays deterministic.
 */
export function qualityFirstOrder<T>(
  entries: T[],
  describe: (entry: T) => RuntimeCandidate,
): T[] {
  return entries
    .map((entry, index) => ({ entry, index, score: candidateScore(describe(entry)) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((row) => row.entry);
}
