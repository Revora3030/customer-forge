/**
 * The Revora model collective — who should think about what.
 *
 * Three paid tiers sit above the free model fabric and the deterministic
 * engine:
 *
 *  - `sol`   master reasoning: fresh creative strategy, information
 *            architecture, conversion architecture, hard content strategy,
 *            visual-QA reasoning, repair prioritisation, final and adversarial
 *            review, cross-specialist synthesis, difficult builder requests.
 *  - `terra` senior cost-balanced specialist: second opinions, page/content
 *            planning, SEO and conversion analysis, design alternatives,
 *            medium-complexity repair planning, validation and critique.
 *  - `luna`  economical high-volume work: extraction, classification, routine
 *            rewrites, small edits, metadata and repetitive reasoning.
 *
 * This module is intentionally pure and environment-free so the routing rules
 * are unit-testable. Credential gating, budget reservation, spend accounting
 * and the actual HTTP call all live in `luna.server.ts`; no tier can ever be
 * reached without passing through those gates, and no tier can bypass the
 * deterministic execution, fact locks, tenant isolation, verification,
 * rollback or publishing gates.
 */

export type CollectiveTier = "sol" | "terra" | "luna";

export const COLLECTIVE_TIERS: CollectiveTier[] = ["sol", "terra", "luna"];

/** Default model per tier. Each is overridable by environment variable. */
export const DEFAULT_COLLECTIVE_MODELS: Record<CollectiveTier, string> = {
  sol: "gpt-5.6-sol",
  terra: "gpt-5.6-terra",
  luna: "gpt-5.6-luna",
};

/**
 * Every kind of thinking the collective is allowed to do. Purposes are named
 * after the job, never after a model, so a tier change is a routing change.
 */
export type CollectivePurpose =
  // master / high complexity
  | "creative_direction"
  | "information_architecture"
  | "conversion_architecture"
  | "content_strategy"
  | "visual_review"
  | "repair_priority"
  | "quality_review"
  | "adversarial_review"
  | "synthesis"
  | "hard_request"
  // senior specialist / medium complexity
  | "second_opinion"
  | "page_planning"
  | "seo_analysis"
  | "design_alternative"
  | "specialist_review"
  | "repair_plan"
  | "plan_review"
  // high volume / cost sensitive
  | "intent"
  | "extraction"
  | "classification"
  | "rewrite"
  | "small_edit"
  | "metadata";

/** The tier a purpose is worth on its own merits. */
const PURPOSE_TIER: Record<CollectivePurpose, CollectiveTier> = {
  creative_direction: "sol",
  information_architecture: "sol",
  conversion_architecture: "sol",
  content_strategy: "sol",
  visual_review: "sol",
  repair_priority: "sol",
  quality_review: "sol",
  adversarial_review: "sol",
  synthesis: "sol",
  hard_request: "sol",

  second_opinion: "terra",
  page_planning: "terra",
  seo_analysis: "terra",
  design_alternative: "terra",
  specialist_review: "terra",
  repair_plan: "terra",
  plan_review: "terra",

  intent: "luna",
  extraction: "luna",
  classification: "luna",
  rewrite: "luna",
  small_edit: "luna",
  metadata: "luna",
};

export type TaskComplexity = "low" | "medium" | "high";

export function purposeTier(purpose: CollectivePurpose): CollectiveTier {
  return PURPOSE_TIER[purpose];
}

const RANK: Record<CollectiveTier, number> = { sol: 3, terra: 2, luna: 1 };

/** True when `a` is at least as capable as `b`. */
export function tierAtLeast(a: CollectiveTier, b: CollectiveTier): boolean {
  return RANK[a] >= RANK[b];
}

/**
 * A first-build's raw signals, turned into a complexity band. Kept crude and
 * explainable on purpose: a customer's intake cannot buy itself a bigger model
 * by being verbose.
 */
export function classifyComplexity(signals: {
  freshBuild?: boolean;
  pageCount?: number;
  serviceCount?: number;
  riskyChange?: boolean;
  instructionChars?: number;
  unresolvedFindings?: number;
}): TaskComplexity {
  if (signals.freshBuild || signals.riskyChange) return "high";
  const pages = Math.max(signals.pageCount ?? 0, 0);
  const services = Math.max(signals.serviceCount ?? 0, 0);
  const findings = Math.max(signals.unresolvedFindings ?? 0, 0);
  const chars = Math.max(signals.instructionChars ?? 0, 0);
  if (pages >= 5 || services >= 8 || findings >= 4 || chars >= 1200) return "high";
  if (pages >= 2 || services >= 3 || findings >= 1 || chars >= 300) return "medium";
  return "low";
}

const TIER_FOR_COMPLEXITY: Record<TaskComplexity, CollectiveTier> = {
  high: "sol",
  medium: "terra",
  low: "luna",
};

export type TierSelection =
  | { tier: CollectiveTier; wanted: CollectiveTier; downgraded: boolean }
  | { tier: null; wanted: CollectiveTier; downgraded: false; reason: "no_tier_available" };

/**
 * Picks the tier for a task, then degrades gracefully to the strongest tier
 * that is actually available. When nothing paid is available the answer is
 * `null` and the caller stays on the free fabric plus the deterministic engine
 * — never a silent paid substitution, never a blocked build.
 */
export function selectTier(input: {
  purpose: CollectivePurpose;
  complexity?: TaskComplexity;
  /** Tiers with credentials, budget and health right now. */
  available: CollectiveTier[];
}): TierSelection {
  const byPurpose = purposeTier(input.purpose);
  const byComplexity = input.complexity ? TIER_FOR_COMPLEXITY[input.complexity] : null;
  // Complexity may raise a purpose's tier but never lower a master task below
  // its purpose: a fresh first build is always master work.
  const wanted =
    byComplexity && RANK[byComplexity] > RANK[byPurpose] ? byComplexity : byPurpose;

  const available = COLLECTIVE_TIERS.filter((tier) => input.available.includes(tier));
  if (!available.length) return { tier: null, wanted, downgraded: false, reason: "no_tier_available" };

  const exact = available.find((tier) => tier === wanted);
  if (exact) return { tier: exact, wanted, downgraded: false };

  // Prefer the next strongest below `wanted`; only then step up.
  const below = available.filter((tier) => RANK[tier] < RANK[wanted]);
  if (below.length) {
    const best = below.reduce((a, b) => (RANK[a] >= RANK[b] ? a : b));
    return { tier: best, wanted, downgraded: true };
  }
  const above = available.reduce((a, b) => (RANK[a] <= RANK[b] ? a : b));
  return { tier: above, wanted, downgraded: true };
}
