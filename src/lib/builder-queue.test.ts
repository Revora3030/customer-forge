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
