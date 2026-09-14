/**
 * Shared contract for future autonomous planning passes.
 * This is descriptive data only; execution remains in site-agent.
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
};

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
};
