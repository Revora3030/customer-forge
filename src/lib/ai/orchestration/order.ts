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
  // Known free-tier flagships whose ids carry no size class.
  if (/(^|\/)gpt-5\.4$/i.test(model)) return 90;
  if (/(^|\/)gpt-4o$/i.test(model)) return 72;
  if (/glm-5|kimi-k2|deepseek-(v3|r1)|qwen3.*(235b|480b)/i.test(model)) return 88;
  // Active-parameter suffixes (e.g. "120b-a12b") describe routing, not size.
  const billions = /(\d{1,4}(?:\.\d)?)\s*b\b/i.exec(model.replace(/[-_]/g, " ").replace(/\ba\d+b\b/gi, ""));
  if (billions) {
    const value = Number(billions[1]);
    if (Number.isFinite(value)) {
      if (value >= 100) return 92;
      if (value >= 60) return 80;
      if (value >= 25) return 66;
      if (value >= 12) return 55;
      return 40;
    }
  }
  if (/large|maverick|codestral/i.test(model)) return 70;
  if (/flash|lite|mini|small|nano|schnell/i.test(model)) return 40;
  return 50;
}

const SPECIALIST_QUALITY = new Map(SPECIALIST_SIX.map((entry) => [entry.model, entry.quality]));

/**
 * Image generators carry no size class in their ids, so the generic weight
 * flattens them all to 50 and input order — not quality — decided routing.
 * These explicit ratings keep the strongest generator first.
 */
const IMAGE_QUALITY = new Map<string, number>([
  ["gpt-image-2.5-sunburst", 96],
  ["gpt-image-2", 88],
  ["gpt-image-2.5-flare", 84],
  ["gemini-3.1-flash-image", 70],
  ["@cf/black-forest-labs/flux-2-klein-4b", 68],
  ["@cf/black-forest-labs/flux-1-schnell", 60],
  ["@cf/stabilityai/stable-diffusion-xl-base-1.0", 50],
  ["@cf/lykon/dreamshaper-8-lcm", 46],
  ["@cf/bytedance/stable-diffusion-xl-lightning", 42],
]);

/** Quality for a runtime candidate: the specialist ceiling, or the id's size class. */
export function candidateQuality(model: string): number {
  return SPECIALIST_QUALITY.get(model) ?? IMAGE_QUALITY.get(model) ?? modelQualityWeight(model);
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
  // Cheaper is very slightly better, and nothing more than that: one whole
  // point in the smallest band, which cannot outbid any higher criterion.
  const cost = candidate.paid ? 0 : 1;
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

/**
 * Keeps an operator-configured group in its configured relative order while
 * leaving quality-first placement untouched.
 *
 * Quality decides WHERE the paid provider chain sits relative to the free pool;
 * the operator still decides WHICH paid provider is tried first. The ranked list
 * keeps its slots, and the group's members are refilled into those slots in the
 * order the operator configured them.
 */
export function preserveGroupOrder<T>(
  ordered: T[],
  original: T[],
  inGroup: (entry: T) => boolean,
): T[] {
  const groupOrder = original.filter(inGroup);
  if (groupOrder.length < 2) return ordered;
  let cursor = 0;
  return ordered.map((entry) => (inGroup(entry) ? (groupOrder[cursor++] ?? entry) : entry));
}
