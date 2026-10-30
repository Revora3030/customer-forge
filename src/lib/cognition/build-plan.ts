/**
 * The site build as a task graph, derived from the real generation steps so it
 * cannot drift from them. Used to explain what a failed build has and has not
 * done; it never runs anything.
 */
import { executionLevels, invalidatedBy, validatePlan, type PlanTask } from "@/lib/cognition/plan-graph";

/** Steps run strictly in order, so each depends on the one before it. */
export function buildPlanFor(stepKeys: readonly string[]): PlanTask[] {
  return stepKeys.map((id, index) => ({ id, dependsOn: index === 0 ? [] : [stepKeys[index - 1]!] }));
}

export type RetryScope = { failed: string; stepNumber: number; totalSteps: number; alreadyDone: string[]; notYetRun: string[] };

/** Where a failed build stopped: the steps before it finished, the failed step and everything after it have not. */
export function retryScope(stepKeys: readonly string[], failedKey: string | null | undefined): RetryScope | null {
  const plan = buildPlanFor(stepKeys);
  if (!failedKey || validatePlan(plan).length || !stepKeys.includes(failedKey)) return null;
  const downstream = invalidatedBy(plan, failedKey);
  const levels = executionLevels(plan) ?? [];
  const order = levels.flat();
  return {
    failed: failedKey,
    stepNumber: order.indexOf(failedKey) + 1,
    totalSteps: order.length,
    alreadyDone: order.slice(0, order.indexOf(failedKey)),
    notYetRun: [failedKey, ...downstream],
  };
}
