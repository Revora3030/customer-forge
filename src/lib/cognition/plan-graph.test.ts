import { describe, expect, it } from "vitest";
import { executionLevels, invalidatedBy, readyTasks, validatePlan, MAX_PLAN_TASKS } from "./plan-graph";

const plan = [
  { id: "audit", dependsOn: [] },
  { id: "page", dependsOn: ["audit"] },
  { id: "deposit", dependsOn: ["page"] },
  { id: "announce", dependsOn: ["page"] },
  { id: "report", dependsOn: ["deposit", "announce"] },
];

describe("plan graph", () => {
  it("accepts a valid plan and groups parallel work into levels", () => {
    expect(validatePlan(plan)).toEqual([]);
    expect(executionLevels(plan)).toEqual([["audit"], ["page"], ["announce", "deposit"], ["report"]]);
  });

  it("rejects cycles, unknown and self dependencies, duplicates, empty and oversized plans", () => {
    expect(validatePlan([{ id: "a", dependsOn: ["b"] }, { id: "b", dependsOn: ["a"] }]).map((p) => p.code)).toEqual(["cycle"]);
    expect(validatePlan([{ id: "a", dependsOn: ["zzz"] }]).map((p) => p.code)).toEqual(["unknown_dependency"]);
    expect(validatePlan([{ id: "a", dependsOn: ["a"] }]).map((p) => p.code)).toEqual(["self_dependency"]);
    expect(validatePlan([{ id: "a", dependsOn: [] }, { id: "a", dependsOn: [] }]).map((p) => p.code)).toContain("duplicate_id");
    expect(validatePlan([]).map((p) => p.code)).toEqual(["empty"]);
    const big = Array.from({ length: MAX_PLAN_TASKS + 1 }, (_, i) => ({ id: `t${i}`, dependsOn: [] }));
    expect(validatePlan(big).map((p) => p.code)).toContain("too_large");
  });

  it("offers only tasks whose dependencies are done", () => {
    expect(readyTasks(plan, {})).toEqual(["audit"]);
    expect(readyTasks(plan, { audit: "done", page: "done" })).toEqual(["deposit", "announce"]);
    expect(readyTasks(plan, { audit: "done", page: "done", deposit: "running" })).toEqual(["announce"]);
  });

  it("a failure invalidates exactly its downstream branch", () => {
    expect(invalidatedBy(plan, "deposit")).toEqual(["report"]);
    expect(invalidatedBy(plan, "page")).toEqual(["deposit", "announce", "report"]);
    expect(invalidatedBy(plan, "report")).toEqual([]);
  });
});
