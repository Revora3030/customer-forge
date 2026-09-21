import { describe, expect, it } from "vitest";
import {
  describeChange,
  emptyHistory,
  type HistoryEntry,
  inversePatch,
  parseHistoryState,
  record,
  redo,
  undo,
} from "@/lib/builder-history";

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: "e1",
  label: "heading on section",
  at: 1,
  table: "website_sections",
  rowId: "sec-1",
  before: { heading: "Old" },
  after: { heading: "New" },
  ...over,
});

describe("inversePatch", () => {
  it("captures only the fields the patch actually changes", () => {
    const result = inversePatch(
      { heading: "Old", body: "Same", is_visible: true },
      { heading: "New", body: "Same" },
    );
    expect(result).toEqual({ before: { heading: "Old" }, after: { heading: "New" } });
  });

  it("returns null for a no-op save so history stays clean", () => {
    expect(inversePatch({ heading: "Same" }, { heading: "Same" })).toBeNull();
  });

  it("returns null when the row is not in cache", () => {
    expect(inversePatch(null, { heading: "New" })).toBeNull();
  });

  it("ignores keys the row does not have", () => {
    expect(inversePatch({ heading: "Old" }, { mystery: 1 })).toBeNull();
  });

  it("normalises a missing previous value to null so undo clears it", () => {
    expect(inversePatch({ link_url: null }, { link_url: "/services" })).toEqual({
      before: { link_url: null },
      after: { link_url: "/services" },
    });
  });

  it("compares object settings by value, not identity", () => {
    expect(inversePatch({ settings: { a: 1 } }, { settings: { a: 1 } })).toBeNull();
    expect(inversePatch({ settings: { a: 1 } }, { settings: { a: 2 } })).toEqual({
      before: { settings: { a: 1 } },
      after: { settings: { a: 2 } },
    });
  });
});

describe("undo / redo stack", () => {
  it("undoes the newest change and offers it for redo", () => {
    const state = record(emptyHistory, entry());
    const undone = undo(state);
    expect(undone?.patch).toEqual({ heading: "Old" });
    expect(undone?.state.future).toHaveLength(1);

    const redone = redo(undone!.state);
    expect(redone?.patch).toEqual({ heading: "New" });
    expect(redone?.state.past).toHaveLength(1);
    expect(redone?.state.future).toHaveLength(0);
  });

  it("returns null when there is nothing to undo or redo", () => {
    expect(undo(emptyHistory)).toBeNull();
    expect(redo(emptyHistory)).toBeNull();
  });

  it("drops the redo branch once a new change is recorded", () => {
    const state = record(emptyHistory, entry());
    const undone = undo(state)!;
    expect(undone.state.future).toHaveLength(1);
    const next = record(undone.state, entry({ id: "e2" }));
    expect(next.future).toHaveLength(0);
    expect(next.past).toHaveLength(1);
  });

  it("undoes several changes in reverse order", () => {
    let state = record(emptyHistory, entry({ id: "a", after: { heading: "A" } }));
    state = record(state, entry({ id: "b", after: { heading: "B" } }));
    const first = undo(state)!;
    expect(first.entry.id).toBe("b");
    const second = undo(first.state)!;
    expect(second.entry.id).toBe("a");
    expect(undo(second.state)).toBeNull();
  });

  it("bounds the stack to the limit, dropping the oldest entries", () => {
    let state = emptyHistory;
    for (let i = 0; i < 6; i++) state = record(state, entry({ id: `e${i}` }), 3);
    expect(state.past).toHaveLength(3);
    expect(state.past[0]?.id).toBe("e3");
  });
});

describe("persisted history", () => {
  it("restores a valid bounded history state after reload", () => {
    const state = { past: Array.from({ length: 60 }, (_, index) => entry({ id: `e${index}` })), future: [entry({ id: "redo" })] };
    const restored = parseHistoryState(JSON.stringify(state));
    expect(restored.past).toHaveLength(50);
    expect(restored.past[0]?.id).toBe("e10");
    expect(restored.future[0]?.id).toBe("redo");
  });

  it("rejects malformed or corrupted stored history", () => {
    expect(parseHistoryState("not-json")).toEqual(emptyHistory);
    expect(parseHistoryState(JSON.stringify({ past: [{ table: "profiles" }], future: [] }))).toEqual(
      emptyHistory,
    );
  });
});

describe("describeChange", () => {
  it("uses owner-friendly field names", () => {
    expect(describeChange("website_sections", { heading: "x" })).toBe("heading on section");
    expect(describeChange("website_components", { link_url: "x", label: "y" })).toBe(
      "link and label on item",
    );
    expect(describeChange("website_pages", { seo_title: "x" })).toBe("search title on page");
  });

  it("summarises long patches", () => {
    expect(
      describeChange("website_sections", { heading: 1, body: 1, settings: 1, variant: 1 }),
    ).toBe("heading and text +2 more on section");
  });

  it("falls back gracefully for an empty patch", () => {
    expect(describeChange("website_components", {})).toBe("item change");
  });
});
