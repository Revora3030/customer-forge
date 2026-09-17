import { describe, expect, it } from "vitest";
import { critiquePlan } from "./plan-critique";

describe("autonomous plan self-critique", () => {
  it("records outcome coverage without changing native actions", () => {
    const plan = {
      actions: [{ type: "set_section_text" }],
      notes: [],
      trace: [],
    };

    const result = critiquePlan(plan);

    expect(result.actions).toEqual(plan.actions);
    expect(result.trace.some((entry) => entry.includes("Autonomous Brain v5"))).toBe(true);
  });

  it("keeps an empty plan safe and explains why nothing should execute", () => {
    const result = critiquePlan({ actions: [], notes: [], trace: [] });

    expect(result.actions).toEqual([]);
    expect(result.notes).toContain(
      "Self-critique found no native actions to execute; the request should remain a question rather than inventing work.",
    );
  });
});
