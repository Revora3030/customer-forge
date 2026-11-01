import { describe, expect, it } from "vitest";
import { DOUBLE_TAP_MS, isDoubleTap } from "@/lib/builder/inline-edit";
import { selectionChipLabel, selectionPrefix } from "@/lib/builder/preview-bridge";
import { selectionScopeFromInstruction } from "@/lib/builder/edit-scope";
import { changedSectionOf } from "@/lib/builder/step-target";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const el = {};

describe("double-tap inline edit (phones)", () => {
  const first = { t: 1000, x: 100, y: 100, target: el };
  it("two quick taps in the same place on the same element", () => {
    expect(isDoubleTap(first, { t: 1000 + DOUBLE_TAP_MS - 1, x: 110, y: 104, target: el })).toBe(true);
  });
  it("not when slow, far apart, on another element, or first", () => {
    expect(isDoubleTap(first, { t: 1000 + DOUBLE_TAP_MS + 1, x: 100, y: 100, target: el })).toBe(false);
    expect(isDoubleTap(first, { t: 1100, x: 200, y: 100, target: el })).toBe(false);
    expect(isDoubleTap(first, { t: 1100, x: 100, y: 100, target: {} })).toBe(false);
    expect(isDoubleTap(null, first)).toBe(false);
    expect(isDoubleTap(first, { ...first })).toBe(false);
  });
});

describe("@Section chip and scope", () => {
  it("names the block, plus the element when one was picked", () => {
    expect(selectionChipLabel({ label: "Services", kind: "services" })).toBe("Services");
    expect(selectionChipLabel({ label: null, kind: "hero", element: "heading" })).toBe("hero · heading");
    expect(selectionChipLabel({ label: " ", kind: null })).toBe("Section");
  });
  it("the tagged section's id leads the instruction, so edit-scope keeps the edit inside it", () => {
    const ctx = { pages: [{ id: "p", sections: [{ id: A, components: [] }, { id: B, components: [] }] }] };
    const text = `${selectionPrefix({ id: A, label: "Services", kind: "services" })} make it friendlier`;
    expect(selectionScopeFromInstruction(text, ctx)).toBe(A);
    expect(selectionScopeFromInstruction("make it friendlier", ctx)).toBeNull();
  });
});

describe("scroll to what changed", () => {
  const pages = [{ sections: [{ id: A, components: [{ id: "c1" }] }, { id: B }] }];
  it("uses the first applied step's section, else the tagged block", () => {
    expect(changedSectionOf([{ target: { sectionId: B } }, { target: { sectionId: A } }], pages, A)).toBe(B);
    expect(changedSectionOf([{ included: false, target: { sectionId: B } }, {}], pages, A)).toBe(A);
    expect(changedSectionOf([], pages, null)).toBeNull();
    expect(changedSectionOf(undefined, pages, B)).toBe(B);
  });
});
