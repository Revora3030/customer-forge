import { describe, expect, it } from "vitest";
import type { CompositionNode } from "@/lib/builder/composition-tree";
import { VIEW_REVEAL_RANGE, alignSplitColumns, onlyDecorationLeft } from "@/components/site/CompositionRenderer";

const text = (align?: "left" | "center" | "right"): CompositionNode =>
  ({ type: "text", text: "Raleigh, NC and 25 miles out", style: align ? { align } : {} }) as never;
const heading = (align?: "left" | "center" | "right"): CompositionNode =>
  ({ type: "heading", text: "Where we work", style: align ? { align } : {} }) as never;

describe("draft recheck fixes", () => {
  it("sets a centred copy column flush left beside a left one", () => {
    const row = { type: "row", style: {}, children: [{ type: "stack", children: [heading("center")] }, { type: "stack", children: [text()] }] } as never;
    const out = alignSplitColumns(row);
    const first = (out[0] as { children: CompositionNode[] }).children[0]!;
    expect(first.style?.align).toBe("left");
  });

  it("leaves single-column and agreeing layouts alone", () => {
    const stack = { type: "stack", children: [heading("center"), text("center")] } as never;
    expect(alignSplitColumns(stack)).toBe((stack as { children: CompositionNode[] }).children);
  });

  it("drops a card whose only surviving children are decoration", () => {
    const children = [{ type: "image" }, { type: "divider" }] as never;
    expect(onlyDecorationLeft(children, [null, "x"])).toBe(true);
    expect(onlyDecorationLeft(children, ["img", "x"])).toBe(false);
  });

  it("reveals on view within a fixed pixel range, never a percentage of a tall element", () => {
    expect(VIEW_REVEAL_RANGE).not.toMatch(/%/);
  });
});
