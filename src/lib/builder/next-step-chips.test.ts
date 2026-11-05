import { describe, expect, it } from "vitest";
import { nextStepChips, NEXT_STEP_LIMIT, type NextStepFacts } from "./next-step-chips";

const base: NextStepFacts = {
  state: "complete",
  instruction: "Add a quote form and a FAQ",
  applied: 2,
  requirements: [],
  changed: ["Add FAQ section · Home"],
  questionCount: 0,
  canLeadTest: true,
  canOpenHistory: true,
  canShowPreview: false,
};

describe("nextStepChips", () => {
  it("shows nothing until the request has finished, or while Revora is asking", () => {
    expect(nextStepChips({ ...base, state: "planning" })).toEqual([]);
    expect(nextStepChips({ ...base, state: "failed" })).toEqual([]);
    expect(nextStepChips({ ...base, questionCount: 1 })).toEqual([]);
  });

  it("offers to finish open requirements first, with the owner's own words", () => {
    const chips = nextStepChips({
      ...base,
      requirements: [
        { label: "FAQ", covered: true },
        { label: "Quote form", covered: false },
      ],
    });
    expect(chips[0]?.label).toBe("Finish: Quote form");
    expect(chips[0]?.action).toMatchObject({ kind: "follow-up" });
    const action = chips[0]?.action;
    expect(action?.kind === "follow-up" && action.prompt).toContain("Add a quote form and a FAQ");
    expect(chips.some((c) => c.label.includes("FAQ"))).toBe(false);
  });

  it("offers a test lead only when the applied change touched a contact path", () => {
    expect(nextStepChips(base).map((c) => c.id)).not.toContain("lead-test");
    expect(nextStepChips({ ...base, changed: ["Add quote form · Contact"] }).map((c) => c.id)).toContain("lead-test");
    expect(
      nextStepChips({ ...base, changed: ["Add quote form"], canLeadTest: false }).map((c) => c.id),
    ).not.toContain("lead-test");
  });

  it("offers preview and history only when something was applied and the action exists", () => {
    expect(nextStepChips({ ...base, canShowPreview: true }).map((c) => c.id)).toEqual(["preview", "history"]);
    expect(nextStepChips({ ...base, applied: 0 })).toEqual([]);
    expect(nextStepChips({ ...base, canOpenHistory: false })).toEqual([]);
  });

  it("never shows more than three chips", () => {
    const chips = nextStepChips({
      ...base,
      canShowPreview: true,
      changed: ["Booking form"],
      requirements: [
        { label: "a", covered: false },
        { label: "b", covered: false },
        { label: "c", covered: false },
      ],
    });
    expect(chips).toHaveLength(NEXT_STEP_LIMIT);
    expect(chips.map((c) => c.id)).toEqual(["open:a", "open:b", "lead-test"]);
  });

  it("shortens long requirement labels", () => {
    const chips = nextStepChips({ ...base, requirements: [{ label: "x".repeat(80), covered: false }] });
    expect(chips[0]?.label.length).toBeLessThanOrEqual("Finish: ".length + 40);
  });
});
