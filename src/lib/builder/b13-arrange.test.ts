import { describe, expect, it } from "vitest";
import {
  dropSpot,
  insertChipLabel,
  insertPrefix,
  isNoopDrop,
  moveAnnouncement,
  pageOfSectionId,
  planSectionMove,
  sectionOrder,
  stepTarget,
  stripInsertPrefix,
  visibleOrder,
  withSectionOrder,
} from "@/lib/builder/arrange";
import { PREVIEW_BRIDGE_SOURCE, ownerWords, readBuilderMessage, readPreviewMessage } from "@/lib/builder/preview-bridge";
import { selectionScopeFromInstruction } from "@/lib/builder/edit-scope";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const H = "44444444-4444-4444-8444-444444444444"; // hidden in the preview
const X = "55555555-5555-4555-8555-555555555555"; // another page

const pages = [
  {
    id: "home",
    sections: [
      { id: B, sort_order: 1 },
      { id: A, sort_order: 0 },
      { id: H, sort_order: 2 },
      { id: C, sort_order: 3 },
    ],
  },
  { id: "about", sections: [{ id: X, sort_order: 0 }] },
];

describe("B13-4 section order planning", () => {
  it("reads the saved order, hidden sections included", () => {
    expect(sectionOrder(pages[0]!)).toEqual([A, B, H, C]);
    expect(pageOfSectionId(pages, X)?.id).toBe("about");
    expect(pageOfSectionId(pages, "nope")).toBeNull();
  });

  it("plans a move from saved data and keeps hidden sections in place", () => {
    expect(planSectionMove(pages, C, A, "before")).toEqual({ pageId: "home", before: [A, B, H, C], after: [C, A, B, H] });
    expect(planSectionMove(pages, A, B, "after")).toEqual({ pageId: "home", before: [A, B, H, C], after: [B, A, H, C] });
  });

  it("never moves across pages, onto itself or to where it already is", () => {
    expect(planSectionMove(pages, A, X, "before")).toBeNull();
    expect(planSectionMove(pages, A, A, "after")).toBeNull();
    expect(planSectionMove(pages, A, B, "before")).toBeNull();
    expect(planSectionMove(pages, "missing", A, "before")).toBeNull();
  });

  it("keyboard steps go one visible section up or down", () => {
    const shown = [A, B, C];
    expect(stepTarget(shown, B, -1)).toEqual({ overId: A, position: "before" });
    expect(stepTarget(shown, B, 1)).toEqual({ overId: C, position: "after" });
    expect(stepTarget(shown, A, -1)).toBeNull();
    expect(stepTarget(shown, C, 1)).toBeNull();
    expect(stepTarget(shown, "x", 1)).toBeNull();
  });

  it("drop spot follows the pointer: upper half before, lower half after, clamps at the ends", () => {
    const blocks = [
      { id: A, top: 0, bottom: 100 },
      { id: B, top: 100, bottom: 300 },
    ];
    expect(dropSpot(blocks, -20)).toEqual({ overId: A, position: "before" });
    expect(dropSpot(blocks, 70)).toEqual({ overId: A, position: "after" });
    expect(dropSpot(blocks, 150)).toEqual({ overId: B, position: "before" });
    expect(dropSpot(blocks, 280)).toEqual({ overId: B, position: "after" });
    expect(dropSpot(blocks, 900)).toEqual({ overId: B, position: "after" });
    expect(dropSpot([], 10)).toBeNull();
  });

  it("knows a drop that changes nothing", () => {
    expect(isNoopDrop([A, B, C], A, B, "before")).toBe(true);
    expect(isNoopDrop([A, B, C], A, A, "after")).toBe(true);
    expect(isNoopDrop([A, B, C], A, C, "after")).toBe(false);
  });

  it("optimistic cache renumbers only that page", () => {
    const next = withSectionOrder(pages, "home", [C, A, B, H]);
    expect(sectionOrder(next[0]!)).toEqual([C, A, B, H]);
    expect(next[1]).toBe(pages[1]);
    expect(visibleOrder([C, A, B, H], [A, B, C])).toEqual([C, A, B]);
  });

  it("announces the new position in plain words", () => {
    expect(moveAnnouncement("Services", [A, B, C], C)).toBe("Services moved to position 3 of 3");
    expect(moveAnnouncement(null, [A], "x")).toBe("Section moved");
  });
});

describe("B13-4 '+ Add section with AI'", () => {
  const spot = { id: B, position: "after" as const, label: "Services", kind: "services" };

  it("labels the composer chip", () => {
    expect(insertChipLabel(spot)).toBe("New section after Services");
    expect(insertChipLabel({ position: "before", label: null, kind: null })).toBe("New section before this section");
  });

  it("is not fenced to the neighbouring block", () => {
    const instruction = `${insertPrefix(spot)} a short FAQ`;
    expect(instruction).toContain(`placed directly after the "Services" section (id ${B})`);
    expect(selectionScopeFromInstruction(instruction, { pages: pages as never })).toBeNull();
  });

  it("keeps quotes and newlines out of the name", () => {
    expect(insertPrefix({ ...spot, label: 'A "big"\nlabel' })).toContain('the "A big label" section');
  });

  it("shows only the owner's words in the chat bubble", () => {
    const instruction = `${insertPrefix(spot)} a short FAQ`;
    expect(stripInsertPrefix(instruction)).toBe("a short FAQ");
    expect(ownerWords(instruction)).toBe("a short FAQ");
  });
});

describe("B13-4 bridge messages", () => {
  const from = (data: Record<string, unknown>) => readPreviewMessage({ source: PREVIEW_BRIDGE_SOURCE, ...data });
  const to = (data: Record<string, unknown>) => readBuilderMessage({ source: PREVIEW_BRIDGE_SOURCE, ...data });

  it("reads a valid move and rejects bad ones", () => {
    expect(from({ type: "move-section", id: A, overId: B, position: "after" })).toMatchObject({ type: "move-section", id: A, overId: B, position: "after" });
    expect(from({ type: "move-section", id: A, overId: A, position: "after" })).toBeNull();
    expect(from({ type: "move-section", id: A, overId: "bad id!", position: "after" })).toBeNull();
    expect(from({ type: "move-section", id: A, overId: B, position: "inside" })).toBeNull();
  });

  it("reads insert and undo requests", () => {
    expect(from({ type: "insert-section", id: B, position: "before", label: "Services", kind: "services" })).toMatchObject({
      type: "insert-section",
      id: B,
      position: "before",
      label: "Services",
    });
    expect(from({ type: "insert-section", id: "<script>", position: "before" })).toBeNull();
    expect(from({ type: "undo-move" })).toMatchObject({ type: "undo-move" });
    expect(readPreviewMessage({ source: "elsewhere", type: "undo-move" })).toBeNull();
  });

  it("reads arrange mode and a rollback order", () => {
    expect(to({ type: "arrange-mode", on: true })).toMatchObject({ on: true });
    expect(to({ type: "arrange-mode", on: "yes" })).toMatchObject({ on: false });
    const order = to({ type: "order", ids: [A, B, A, "bad id!", 7], announce: "Put back" });
    expect(order).toMatchObject({ type: "order", ids: [A, B], announce: "Put back" });
    expect(to({ type: "order", ids: "nope" })).toBeNull();
  });
});
