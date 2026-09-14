import type { AgentContext } from "@/lib/agent/types";
import { buildAutonomousPlan } from "@/lib/builder/autonomous-brain";
import { DEFAULT_AUTONOMY_POLICY } from "@/lib/builder/upgrade-contract";

export type AutonomousLoopStage =
  | "inspect"
  | "plan"
  | "build"
  | "score"
  | "fix"
  | "verify"
  | "complete";

export type AutonomousLoopResult = {
  stage: AutonomousLoopStage;
  plan: Awaited<ReturnType<typeof buildAutonomousPlan>>;
  repairRequested: boolean;
  verificationRequired: boolean;
  maxIterations: number;
  trace: string[];
};

/**
 * Safe orchestration contract for Revora's autonomous builder.
 *
 * This module plans and gates the loop; it deliberately does not write to the
 * database or bypass the existing executor. Callers should execute the
 * returned plan through the normal approval/atomic-write path, then feed a
 * fresh site snapshot into the next iteration.
 */
export function buildAutonomousLoopPlan(
  context: AgentContext,
  instruction: string,
  options: Parameters<typeof buildAutonomousPlan>[2] = {},
): AutonomousLoopResult {
  const plan = buildAutonomousPlan(context, instruction, options);
  const maxIterations = 2;
  const repairRequested = plan.qualityProfile.priorities.length > 0;

  return {
    stage: "plan",
    plan,
    repairRequested,
    verificationRequired: true,
    maxIterations,
    trace: [
      "inspect: workspace context supplied",
      "plan: autonomous plan compiled",
      "build: execute through the existing approved executor",
      "score: evaluate the resulting site with the quality profile",
      repairRequested
        ? "fix: safe quality repairs may be planned on the next pass"
        : "fix: no additional deterministic repair priority detected",
      "verify: require a fresh site snapshot before declaring completion",
    ],
  };
}

export function canAutoContinueAfterVerification(input: {
  score: number;
  iteration: number;
  policy?: typeof DEFAULT_AUTONOMY_POLICY;
  hasHighImpactChange?: boolean;
}): boolean {
  const policy = input.policy ?? DEFAULT_AUTONOMY_POLICY;
  if (input.hasHighImpactChange) return false;
  if (!policy.allowBroadPlanning) return false;
  if (input.iteration >= 2) return false;
  return input.score < 95;
}
