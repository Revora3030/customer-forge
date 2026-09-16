/**
 * Shared contract for Revora's autonomous builder.
 *
 * This is planning policy only. Database writes, authorization, publishing,
 * snapshots and rollback remain in the site-agent executor.
 */
export type BuilderQualityDimension =
  | "design"
  | "conversion"
  | "content"
  | "mobile"
  | "seo"
  | "trust"
  | "accessibility"
  | "performance"
  | "structure";

export type BuilderQualitySnapshot = {
  score: number;
  dimensions: Partial<Record<BuilderQualityDimension, number>>;
  priorities: BuilderQualityDimension[];
  confidence: number;
};

export type BuilderAutonomyPolicy = {
  allowBroadPlanning: boolean;
  requireConfirmationFor: string[];
  preserveBusinessFacts: boolean;
  preserveExistingExecutor: boolean;
  maxPlannedActions: number;
  maxRepairPasses: number;
  qualityTarget: number;
  minimumImprovementForRepair: number;
};

/** Conservative defaults: autonomy improves safe presentation/conversion work,
 * but never silently crosses billing/auth/publishing/destructive boundaries. */
export const DEFAULT_AUTONOMY_POLICY: BuilderAutonomyPolicy = {
  allowBroadPlanning: true,
  requireConfirmationFor: [
    "business facts",
    "billing",
    "authentication",
    "publishing",
    "destructive changes",
  ],
  preserveBusinessFacts: true,
  preserveExistingExecutor: true,
  maxPlannedActions: 56,
  maxRepairPasses: 2,
  qualityTarget: 95,
  minimumImprovementForRepair: 1,
};

export const QUALITY_DIMENSIONS: readonly BuilderQualityDimension[] = [
  "design",
  "conversion",
  "content",
  "mobile",
  "seo",
  "trust",
  "accessibility",
  "performance",
  "structure",
] as const;

export function clampQualityScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function shouldRepairQuality(input: {
  score: number;
  previousScore?: number;
  iteration: number;
  policy?: BuilderAutonomyPolicy;
  hasHighImpactChange?: boolean;
}): boolean {
  const policy = input.policy ?? DEFAULT_AUTONOMY_POLICY;
  if (input.hasHighImpactChange) return false;
  if (!policy.allowBroadPlanning) return false;
  if (input.iteration >= policy.maxRepairPasses) return false;
  const score = clampQualityScore(input.score);
  const previous = input.previousScore == null ? null : clampQualityScore(input.previousScore);
  if (score >= policy.qualityTarget) return false;
  // A repair pass must produce a real quality improvement. With the default
  // minimum of 1 point, an unchanged score cannot trigger another pass.
  if (previous != null && score < previous + policy.minimumImprovementForRepair) return false;
  return true;
}
