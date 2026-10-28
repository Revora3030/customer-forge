import { describe, expect, it } from "vitest";
import { approvedSteps, canAutoApply, moveStep, newTask, nextRunnable, queueSummary, removeStep,
  terminalStateForEmptyPlan, toPlanSteps, toggleStep, updateTask } from "@/lib/builder-queue";

const withSteps = (destructive = false) => ({
  ...newTask("Add a services page"),
  steps: toPlanSteps([
    { key: "a", title: "Create the services page", where: "Services", destructive: false },
    { key: "b", title: "Remove the old block", where: "Home", destructive },
  ]),
});

describe("builder queue", () => {
  it("runs one request at a time", () => {
    const a = newTask("first"), b = newTask("second");
    expect(nextRunnable([a, b])?.instruction).toBe("first");
    expect(nextRunnable(updateTask([a, b], a.id, { state: "building" }))).toBeNull();
  });
  it("only builds steps the owner kept", () => {
    let task = toggleStep(withSteps(), "b");
    expect(approvedSteps(task).map((s) => s.key)).toEqual(["a"]);
    task = removeStep(task, "a");
    expect(task.steps).toHaveLength(1);
  });
  it("reorders steps and stops at the ends", () => {
    const task = withSteps();
    expect(moveStep(task, "b", -1).steps.map((s) => s.key)).toEqual(["b", "a"]);
    expect(moveStep(task, "a", -1).steps.map((s) => s.key)).toEqual(["a", "b"]);
  });
  it("never auto-applies a plan that removes content or asks a question", () => {
    expect(canAutoApply(withSteps(false))).toBe(true);
    expect(canAutoApply(withSteps(true))).toBe(false);
    expect(canAutoApply({ ...withSteps(false), questions: ["Which city?"] })).toBe(false);
    expect(canAutoApply({ ...withSteps(false), steps: [] })).toBe(false);
  });
  it("summarises the queue without inventing progress", () => {
    expect(queueSummary([])).toBe("");
    const a = { ...newTask("one"), state: "complete" as const };
    const b = { ...newTask("two"), state: "failed" as const };
    expect(queueSummary([a, b, newTask("three")])).toBe("1 done · 1 waiting · 1 didn't work");
  });
  it("counts only what didn't work now: not an earlier visit, not a build a newer build replaced", () => {
    const failedBuild = { ...newTask("Fresh rebuild"), state: "failed" as const, isBuild: true };
    const newerBuild = { ...newTask("Fresh rebuild"), state: "building" as const, isBuild: true };
    // The latest build failing is the current problem.
    expect(queueSummary([failedBuild])).toBe("0 done · 1 didn't work");
    // A newer build replaces it, so a rebuild in progress is not shown under the old failure.
    expect(queueSummary([failedBuild, newerBuild])).toBe("");
    // The newer build failing too is one problem, not two.
    expect(queueSummary([failedBuild, { ...newerBuild, state: "failed" as const }])).toBe("0 done · 1 didn't work");
    // History restored from an earlier visit is in the thread but not in the count.
    expect(queueSummary([{ ...newTask("old request"), state: "failed" as const, restored: true }])).toBe("");
    // A failed edit request in this visit still counts, even next to a build.
    expect(queueSummary([{ ...newTask("set my title"), state: "failed" as const }, newerBuild])).toBe("0 done · 1 didn't work");
  });
  it("never leaves an empty plan in a silent hold", () => {
    expect(terminalStateForEmptyPlan({ steps: [], questions: [], unavailable: null })).toBe("failed");
    expect(terminalStateForEmptyPlan({ steps: [], questions: [], unavailable: { retryable: false } })).toBe("failed");
  });
  it("keeps a plan that needs an answer or has steps in the approval lane", () => {
    const steps = toPlanSteps([{ key: "a", title: "Set SEO title", where: "Home" }]);
    expect(terminalStateForEmptyPlan({ steps, questions: [], unavailable: null })).toBe("waiting_for_approval");
    expect(terminalStateForEmptyPlan({ steps: [], questions: ["Which page?"], unavailable: null })).toBe("waiting_for_approval");
  });
  it("allows a safe plan when its destructive step was excluded", () => {
    const task = toggleStep(withSteps(true), "b");
    expect(canAutoApply(task)).toBe(true);
    expect(approvedSteps(task).some((step) => step.destructive)).toBe(false);
  });
  it("does not mutate a plan while checking approval", () => {
    const task = withSteps(true);
    const before = JSON.stringify(task);
    expect(canAutoApply(task)).toBe(false);
    expect(JSON.stringify(task)).toBe(before);
  });
});

describe("plan steps know where they point", () => {
  const S = "11111111-1111-4111-8111-111111111111";
  it("carries the section a planned change touches, and nothing for a section still being created", () => {
    const steps = toPlanSteps([
      { key: "a", title: "Warmer headline", where: "Home → Hero", action: { type: "set_section_text", sectionId: S } },
      { key: "b", title: "New FAQ", where: "Home → FAQ", action: { type: "set_composition", sectionId: "temp_section_1" } },
      { key: "c", title: "Set SEO title", where: "Home" },
    ]);
    expect(steps[0]!.target).toEqual({ sectionId: S });
    expect(steps[1]).not.toHaveProperty("target");
    expect(steps[2]).not.toHaveProperty("target");
  });
});
