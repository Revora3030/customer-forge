import { describe, expect, it } from "vitest";
import {
  discardEdit,
  hasPending,
  pendingPatch,
  stageEdit,
  stagedCount,
  stagedEdits,
  stagedFieldSummary,
  withPending,
  type StagedState,
} from "./staged-edit";

const saved = { id: "s1", heading: "Original heading", body: "Original body", is_visible: true };

describe("staged visual edits", () => {
  it("keeps changes out of the saved row until they are applied", () => {
    const state = stageEdit({}, "section", "s1", { heading: "New heading" }, saved);
    expect(stagedCount(state)).toBe(1);
    expect(pendingPatch(state, "section", "s1")).toEqual({ heading: "New heading" });
    expect(withPending(state, "section", saved).heading).toBe("New heading");
    expect(saved.heading).toBe("Original heading");
  });

  it("merges several changes to one element into a single pending edit", () => {
    let state = stageEdit({}, "section", "s1", { heading: "A" }, saved);
    state = stageEdit(state, "section", "s1", { body: "B" }, saved);
    state = stageEdit(state, "section", "s1", { heading: "C" }, saved);
    expect(stagedCount(state)).toBe(1);
    expect(pendingPatch(state, "section", "s1")).toEqual({ heading: "C", body: "B" });
    expect(stagedEdits(state)[0]?.before).toEqual({
      heading: "Original heading",
      body: "Original body",
    });
  });

  it("stops being pending when a field is typed back to its saved value", () => {
    let state = stageEdit({}, "section", "s1", { heading: "A" }, saved);
    state = stageEdit(state, "section", "s1", { heading: "Original heading" }, saved);
    expect(stagedCount(state)).toBe(0);
    expect(hasPending(state, "section", "s1")).toBe(false);
  });

  it("treats a section and a component with the same id separately", () => {
    let state: StagedState = stageEdit({}, "section", "x", { heading: "S" }, saved);
    state = stageEdit(state, "component", "x", { body: "C" }, saved);
    expect(stagedCount(state)).toBe(2);
    expect(pendingPatch(state, "section", "x")).toEqual({ heading: "S" });
    expect(pendingPatch(state, "component", "x")).toEqual({ body: "C" });
  });

  it("compares nested values so an identical object is not a change", () => {
    const row = { id: "c1", settings: { items: [{ q: "a" }] } };
    const state = stageEdit({}, "component", "c1", { settings: { items: [{ q: "a" }] } }, row);
    expect(stagedCount(state)).toBe(0);
    const changed = stageEdit({}, "component", "c1", { settings: { items: [{ q: "b" }] } }, row);
    expect(pendingPatch(changed, "component", "c1")).toEqual({ settings: { items: [{ q: "b" }] } });
  });

  it("cancels one element without touching another", () => {
    let state = stageEdit({}, "section", "s1", { heading: "A" }, saved);
    state = stageEdit(state, "section", "s2", { heading: "B" }, { id: "s2", heading: "Old" });
    state = discardEdit(state, "section", "s1");
    expect(stagedCount(state)).toBe(1);
    expect(pendingPatch(state, "section", "s2")).toEqual({ heading: "B" });
  });

  it("describes pending changes in plain words", () => {
    let state = stageEdit({}, "section", "s1", { heading: "A" }, saved);
    expect(stagedFieldSummary(state)).toBe("heading");
    state = stageEdit(state, "section", "s1", { body: "B", is_visible: false }, saved);
    expect(stagedFieldSummary(state)).toBe("heading, text and visibility");
    expect(stagedFieldSummary({})).toBe("");
  });
});
