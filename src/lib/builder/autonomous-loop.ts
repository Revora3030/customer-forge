import type { AgentContext } from "@/lib/site-agent.server";
import { buildAutonomousPlan } from "@/lib/builder/autonomous-brain";
import {
  DEFAULT_AUTONOMY_POLICY,
  clampQualityScore,
  shouldRepairQuality,
} from "@/lib/builder/upgrade-contract";

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
 * Planning is intentionally pure. Callers execute through the existing
 * approval/atomic-write path and then supply a fresh site snapshot for the
 * next pass. No database writes, model calls, or executor bypasses occur here.
 */
export function buildAutonomousLoopPlan(
  context: AgentContext,
  instruction: string,
  options: Parameters<typeof buildAutonomousPlan>[2] = {},
): AutonomousLoopResult {
  const plan = buildAutonomousPlan(context, instruction, options);
  const maxIterations = DEFAULT_AUTONOMY_POLICY.maxRepairPasses;
  const repairRequested = plan.coverage !== "none" && plan.actions.length > 0;

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
        : "fix: no executable deterministic repair detected",
      "verify: require a fresh site snapshot before declaring completion",
    ],
  };
}

/** Creates a concise, business-readable repair request from verification output. */
export function buildRepairInstruction(
  originalInstruction: string,
  verificationSummary: string,
): string {
  const original = originalInstruction.trim().slice(0, 1200);
  const summary = verificationSummary.trim().slice(0, 1200);
  return `${original}\n\nRevora's verification found this remaining issue: ${summary}\nFix that issue without changing verified business facts, billing, authentication, publishing, or destructive content.`.trim();
}

export function canAutoContinueAfterVerification(input: {
  score: number;
  iteration: number;
  previousScore?: number;
  policy?: typeof DEFAULT_AUTONOMY_POLICY;
  hasHighImpactChange?: boolean;
}): boolean {
  const policy = input.policy ?? DEFAULT_AUTONOMY_POLICY;
  return shouldRepairQuality({
    score: clampQualityScore(input.score),
    previousScore: input.previousScore,
    iteration: input.iteration,
    policy,
    hasHighImpactChange: input.hasHighImpactChange,
  });
}
