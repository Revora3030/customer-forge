import { describe, expect, it } from "vitest";
import { QUALITY_STEPS, STEP_ROUTING, roleForStep, routingTable } from "@/lib/builder/quality/model-routing";

describe("model routing", () => {
  it("routes every step to an existing role", () => {
    for (const step of QUALITY_STEPS) expect(["primary", "design", "fast", "vision", "coding"]).toContain(roleForStep(step, {}));
  });
  it("uses stronger roles for plan and copy than for the checks", () => {
    expect(STEP_ROUTING.plan.tier).toBe("strong");
    expect(STEP_ROUTING.copy.tier).toBe("strong");
    for (const s of ["review", "facts-check", "lint"] as const) expect(STEP_ROUTING[s].tier).toBe("cheap");
  });
  it("accepts a valid override and ignores an unknown one", () => {
    expect(roleForStep("review", { QP_STEP_ROLE_REVIEW: "vision" })).toBe("vision");
    expect(roleForStep("review", { QP_STEP_ROLE_REVIEW: "gpt-99" })).toBe("fast");
    expect(roleForStep("facts-check", { QP_STEP_ROLE_FACTS_CHECK: "coding" })).toBe("coding");
  });
  it("returns the full table", () => {
    expect(Object.keys(routingTable({})).sort()).toEqual([...QUALITY_STEPS].sort());
  });
});
