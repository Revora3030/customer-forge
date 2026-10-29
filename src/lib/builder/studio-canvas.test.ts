import { describe, expect, it } from "vitest";
import type { CompositionNode } from "@/lib/builder/composition-tree";
import { healSplitCards, omitRepeatedCalls, prepareStudioPage, stalePendingSlots, studioSectionColor, STUDIO_CANVAS } from "./studio-canvas";

const button = (text: string): CompositionNode => ({ type: "button", text, href: "/book" });
const card = (text: string): CompositionNode => ({ type: "card", children: [{ type: "heading", level: 3, text }] });

describe("studio canvas", () => {
  it("turns a light section fill obsidian when the page has a photographic chapter", () => {
    expect(studioSectionColor("#f4efe6", true)).toBe(STUDIO_CANVAS);
    expect(studioSectionColor("#071014", true)).toBe("#071014");
    expect(studioSectionColor("#f4efe6", false)).toBe("#f4efe6");
  });

  it("keeps one copy of a call to action that was repeated under every section", () => {
    const roots = [0, 1, 2].map(() => ({ type: "stack" as const, children: [button("Call to schedule your detail")] }));
    const kept = omitRepeatedCalls(roots);
    const labels = kept.flatMap((root) => root.children ?? []).map((node) => node.text);
    expect(labels).toEqual(["Call to schedule your detail"]);
  });

  it("joins split service cards and drops their light fill", () => {
    const root: CompositionNode = {
      type: "scene",
      children: [
        { type: "media", mediaRef: "pic" },
        { type: "grid", children: [card("Full"), card("Auto detailing")] },
      ],
    };
    const healed = healSplitCards(root);
    const grid = healed.children?.[1];
    expect(grid?.children).toHaveLength(1);
    expect(grid?.children?.[0]?.children?.[0]?.text).toBe("Full Auto detailing");
    const prepared = prepareStudioPage([
      { type: "scene", style: { background: "#f6f1e8", color: "#1a1a1a" }, children: [{ type: "heading", level: 1, text: "Detail", style: { color: "#111111" } }] },
    ]);
    expect(prepared.studio).toBe(true);
    expect(prepared.roots[0]?.style?.background).toBeUndefined();
    expect(prepared.roots[0]?.style?.color).toBe("#f4f1ea");
  });

  it("lifts a headline and its picture into one full-bleed scene", () => {
    const prepared = prepareStudioPage([
      {
        type: "stack",
        children: [
          { type: "heading", level: 1, text: "One mobile detail" },
          { type: "text", text: "Covering the whole vehicle" },
          { type: "media", mediaRef: "door" },
        ],
      },
    ], true);
    expect(prepared.roots[0]?.type).toBe("scene");
    expect(prepared.roots[0]?.children?.[0]?.type).toBe("media");
  });

  it("leaves a page without chapters on its own palette", () => {
    const prepared = prepareStudioPage([{ type: "stack", style: { background: "#f6f1e8" }, children: [] }]);
    expect(prepared.studio).toBe(false);
    expect(prepared.roots[0]?.style?.background).toBe("#f6f1e8");
  });

  it("lists pending picture slots this build did not approve", () => {
    expect(stalePendingSlots(
      [{ slot: "hero", status: "pending" }, { slot: "old", status: "pending" }, { slot: "kept", status: "approved" }],
      ["hero"],
    )).toEqual(["old"]);
  });
});
