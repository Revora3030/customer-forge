import { describe, expect, it } from "vitest";
import { buildPlanFor, retryScope } from "./build-plan";
import { executionLevels, validatePlan } from "./plan-graph";
import { GENERATION_STEPS } from "@/lib/site-engine";

const KEYS = GENERATION_STEPS.map((step) => step.key);

describe("build plan", () => {
  it("is a valid, acyclic plan over exactly the real generation steps, in order", () => {
    const plan = buildPlanFor(KEYS);
    expect(validatePlan(plan)).toEqual([]);
    expect(plan.map((task) => task.id)).toEqual(KEYS);
    expect(executionLevels(plan)!.flat()).toEqual(KEYS);
  });

  it("says where a failed build stopped: what finished and what has not run", () => {
    const scope = retryScope(KEYS, "layout")!;
    expect(scope).toMatchObject({ failed: "layout", stepNumber: 11, totalSteps: 14 });
    expect(scope.alreadyDone).toEqual(KEYS.slice(0, 10));
    expect(scope.notYetRun).toEqual(["layout", "checks", "leads", "ready"]);
  });

  it("handles the first and last steps, and refuses unknown or missing ones", () => {
    expect(retryScope(KEYS, "business")).toMatchObject({ stepNumber: 1, alreadyDone: [] });
    expect(retryScope(KEYS, "ready")).toMatchObject({ stepNumber: 14, notYetRun: ["ready"] });
    expect(retryScope(KEYS, "nope")).toBeNull();
    expect(retryScope(KEYS, null)).toBeNull();
    expect(retryScope([], "layout")).toBeNull();
  });
});
