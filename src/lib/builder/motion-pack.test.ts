import { describe, expect, it } from "vitest";
import { buildMotionPlan, motionSummary, planMotionAssignments } from "@/lib/builder/motion-pack";
import { isSectionEffectId } from "@/lib/site-effects";

const fingerprint = (motionLevel: "none" | "subtle" | "expressive", seed = 12345) => ({
  motionLevel,
  seed,
  motionPattern: "reveal",
});

describe("motion pack", () => {
  it("never animates the hero or legal copy", () => {
    for (const level of ["none", "subtle", "expressive"] as const) {
      const plan = buildMotionPlan(fingerprint(level));
      expect(plan.perKind["hero"]).toBe("none");
      expect(plan.perKind["policy"]).toBe("none");
      expect(plan.perKind["trust_bar"]).toBe("none");
    }
  });

  it("only ever chooses allowlisted effects", () => {
    for (const level of ["none", "subtle", "expressive"] as const) {
      const plan = buildMotionPlan(fingerprint(level));
      for (const effect of Object.values(plan.perKind)) {
        expect(isSectionEffectId(effect)).toBe(true);
      }
    }
  });

  it("turns everything off at the calmest level", () => {
    const plan = buildMotionPlan(fingerprint("none"));
    expect(Object.values(plan.perKind).every((effect) => effect === "none")).toBe(true);
    expect(plan.hover).toBe(false);
    expect(plan.sectionTransitions).toBe(false);
  });

  it("is deterministic for the same identity", () => {
    const a = buildMotionPlan(fingerprint("expressive", 9876));
    const b = buildMotionPlan(fingerprint("expressive", 9876));
    expect(a).toEqual(b);
  });

  it("differs between two identities", () => {
    const a = buildMotionPlan(fingerprint("expressive", 1));
    const b = buildMotionPlan(fingerprint("expressive", 4));
    expect(JSON.stringify(a.perKind)).not.toBe(JSON.stringify(b.perKind));
  });

  it("an explicit request overrides the stored level", () => {
    const plan = buildMotionPlan(fingerprint("expressive"), "none");
    expect(plan.intensity).toBe("none");
  });

  it("only reports sections that actually change", () => {
    const plan = buildMotionPlan(fingerprint("subtle"));
    const target = plan.perKind["services"];
    const assignments = planMotionAssignments(
      [
        { id: "a", kind: "services", settings: { effect: target } },
        { id: "b", kind: "services", settings: {} },
        { id: "c", kind: "hero", settings: { effect: "rise" } },
        { id: "d", kind: "unknown_kind", settings: {} },
      ],
      plan,
    );
    expect(assignments.map((entry) => entry.sectionId)).toEqual(["b", "c"]);
  });

  it("says nothing changed when nothing changed", () => {
    const plan = buildMotionPlan(fingerprint("subtle"));
    expect(motionSummary([], plan)).toContain("already matches");
  });

  it("counts the blocks it changed", () => {
    const plan = buildMotionPlan(fingerprint("subtle"));
    const summary = motionSummary(
      [{ sectionId: "a", kind: "services", from: "none", to: "rise" }],
      plan,
    );
    expect(summary).toContain("1 block updated");
  });
});
