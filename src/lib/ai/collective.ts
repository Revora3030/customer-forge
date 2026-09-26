/**
 * The Revora model collective — who should think about what.
 *
 * Three paid tiers sit above the free and paid model fabric plus the validated
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
 * validated execution, fact locks, tenant isolation, verification,
 * rollback or publishing gates.
 */

export type CollectiveTier = "sol" | "terra" | "luna";

export const COLLECTIVE_TIERS: CollectiveTier[] = ["sol", "terra", "luna"];

/** Default model per tier. Each is overridable by environment variable. */
export const DEFAULT_COLLECTIVE_MODELS: Record<CollectiveTier, string> = {
  sol: "gpt-6-sol",
  terra: "gpt-5.6-terra",
  luna: "gpt-6-luna",
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
  // Astra's own verification and advisory lanes
  | "funnel_verification"
  | "site_consistency_audit"
  | "industry_gap_analysis"
  // independent senior pre-publish review (GPT-5.6 Sol, in the Sol tier)
  | "final_review"
  // high volume / cost sensitive
  | "intent"
  | "extraction"
  | "classification"
  | "rewrite"
  | "small_edit"
  | "metadata"
  // structured completeness utility (GPT-5.6 Luna, in the Luna tier)
  | "schema_markup"
  | "completeness_check";

/** The tier a purpose is worth on its own merits. */
const PURPOSE_TIER: Record<CollectivePurpose, CollectiveTier> = {
  creative_direction: "sol",
  information_architecture: "sol",
  conversion_architecture: "sol",
  content_strategy: "sol",
  // Independent review belongs to Terra: the reviewer must never be the same
  // model that authored the work it is attacking.
  visual_review: "terra",
  repair_priority: "sol",
  quality_review: "sol",
  adversarial_review: "terra",
  synthesis: "sol",
  hard_request: "sol",

  second_opinion: "terra",
  page_planning: "terra",
  seo_analysis: "terra",
  design_alternative: "terra",
  specialist_review: "terra",
  repair_plan: "terra",
  plan_review: "terra",
  final_review: "sol",

  intent: "luna",
  extraction: "luna",
  classification: "luna",
  rewrite: "luna",
  small_edit: "luna",
  metadata: "luna",
  schema_markup: "luna",
  completeness_check: "luna",
};

/**
 * Purposes served by a peer model inside their tier. GPT-5.6 Sol reviews GPT-6
 * Sol's work (a different model, so it is a genuine second opinion) and
 * GPT-5.6 Luna shares structured utility work with GPT-6 Luna. Overridable by
 * SOL_PEER_MODEL / LUNA_PEER_MODEL.
 *
 * The high-volume utility purposes are pointed at `gpt-5.4-mini`, which sits
 * inside OpenAI's shared-traffic daily token allowance: that work is the bulk
 * of Revora's call volume and none of it touches paid credit until the daily
 * allowance is used up. Creative writing, design and the senior reviews stay on
 * the full paid models — quality is never traded for the allowance.
 */
export const PEER_PURPOSE_MODELS: Partial<Record<CollectivePurpose, { model: string; env: string }>> = {
  final_review: { model: "gpt-5.6-sol", env: "SOL_PEER_MODEL" },
  // Astra (GPT-6 Astra) takes the deep plan and specialist reviews: a strong
  // reasoner that authored none of the work it checks. Terra keeps the
  // adversarial, visual, SEO and repair lanes.
  plan_review: { model: "gpt-6-astra", env: "ASTRA_REVIEW_MODEL" },
  specialist_review: { model: "gpt-6-astra", env: "ASTRA_REVIEW_MODEL" },
  schema_markup: { model: "gpt-5.6-luna", env: "LUNA_PEER_MODEL" },
  completeness_check: { model: "gpt-5.6-luna", env: "LUNA_PEER_MODEL" },
  intent: { model: "gpt-5.4-mini", env: "LUNA_ALLOWANCE_MODEL" },
  extraction: { model: "gpt-5.4-mini", env: "LUNA_ALLOWANCE_MODEL" },
  classification: { model: "gpt-5.4-mini", env: "LUNA_ALLOWANCE_MODEL" },
  metadata: { model: "gpt-5.4-mini", env: "LUNA_ALLOWANCE_MODEL" },
  small_edit: { model: "gpt-5.4-mini", env: "LUNA_ALLOWANCE_MODEL" },
};


/** Independent review purposes must not be raised to Sol by complexity. */
const INDEPENDENT_REVIEW = new Set<CollectivePurpose>(["adversarial_review", "visual_review", "final_review"]);

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
 * `null` and the caller stays on the free AI fabric
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
  // Independent-review purposes are pinned: raising them to Sol would make
  // Sol grade its own creative work.
  const wanted = INDEPENDENT_REVIEW.has(input.purpose)
    ? byPurpose
    : byComplexity && RANK[byComplexity] > RANK[byPurpose]
      ? byComplexity
      : byPurpose;

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
