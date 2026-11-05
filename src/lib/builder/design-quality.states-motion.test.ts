import { describe, expect, it } from "vitest";
import type { CompositionNode, CompositionTree } from "./composition-tree";
import { MAX_STAGGERED_ITEMS, MAX_STAGGER_MS, auditPageCraft, auditStatesAndMotion, needsDesignRepair } from "./design-quality";

const tree = (root: CompositionNode): CompositionTree => ({ version: 1, root });
const h = (text: string): CompositionNode => ({ type: "heading", level: 2, text });
const t = (text: string): CompositionNode => ({ type: "text", text });
const codes = (found: { code: string }[]) => found.map((f) => f.code);
const LONG = "Same-day drain clearing with a camera check so you can see what we found before you pay.";
const item = (delayMs: number, kind: "rise" | "fade" | "float" = "rise"): CompositionNode => ({
  type: "card",
  motion: { kind, delayMs, durationMs: 400 },
  children: [h("Service"), t("Short line.")],
});

describe("auditStatesAndMotion: stagger budget", () => {
  it("passes a short stagger", () => {
    const grid: CompositionNode = { type: "grid", children: [item(0), item(120), item(240), item(360)] };
    expect(auditStatesAndMotion(tree(grid))).toEqual([]);
  });

  it("flags an entrance that waits longer than the stagger budget", () => {
    const grid: CompositionNode = { type: "grid", children: [item(100), item(MAX_STAGGER_MS + 200)] };
    const found = auditStatesAndMotion(tree(grid));
    expect(codes(found)).toEqual(["motion_stagger_too_long"]);
    expect(found[0]!.path).toBe("root.children[1]");
    expect(found[0]!.fix).toContain("1200ms");
  });

  it("allows exactly the budget", () => {
    const grid: CompositionNode = { type: "grid", children: [item(MAX_STAGGER_MS)] };
    expect(auditStatesAndMotion(tree(grid))).toEqual([]);
  });

  it("flags more staggered items than the cap, pointing at the first extra one", () => {
    const children = Array.from({ length: MAX_STAGGERED_ITEMS + 2 }, (_, i) => item(40 + i * 10));
    const found = auditStatesAndMotion(tree({ type: "grid", children }));
    expect(codes(found)).toEqual(["motion_too_many_staggered"]);
    expect(found[0]!.path).toBe(`root.children[${MAX_STAGGERED_ITEMS}]`);
  });

  it("does not count ambient float motion or items without a delay", () => {
    const children = Array.from({ length: 20 }, (_, i) => item(i % 2 ? 5000 : 0, i % 2 ? "float" : "rise"));
    expect(auditStatesAndMotion(tree({ type: "grid", children }))).toEqual([]);
  });

  it("ignores looping motion", () => {
    const loop: CompositionNode = { type: "card", motion: { kind: "rise", delayMs: 2500, repeat: "loop" }, children: [h("A")] };
    expect(auditStatesAndMotion(tree({ type: "stack", children: [loop] }))).toEqual([]);
  });
});

describe("auditStatesAndMotion: translucent surfaces", () => {
  it("flags body copy on frosted glass with no solid background", () => {
    const glass: CompositionNode = { type: "card", style: { blur: 12 }, children: [h("Why us"), t(LONG)] };
    const found = auditStatesAndMotion(tree({ type: "stack", children: [glass] }));
    expect(codes(found)).toEqual(["translucent_text_backing"]);
    expect(found[0]!.path).toBe("root.children[0]");
  });

  it("flags body copy on a see-through surface", () => {
    const faint: CompositionNode = { type: "card", style: { opacity: 60, background: "#112233" }, children: [t(LONG)] };
    expect(codes(auditStatesAndMotion(tree({ type: "stack", children: [faint] })))).toEqual(["translucent_text_backing"]);
  });

  it("passes frosted glass that has a solid background, or only a short heading", () => {
    const backed: CompositionNode = { type: "card", style: { blur: 12, background: "#101820" }, children: [t(LONG)] };
    const labelOnly: CompositionNode = { type: "card", style: { blur: 12 }, children: [h("Why us"), t("Fast.")] };
    expect(auditStatesAndMotion(tree({ type: "stack", children: [backed, labelOnly] }))).toEqual([]);
  });

  it("passes a nearly solid surface", () => {
    const solid: CompositionNode = { type: "card", style: { opacity: 90 }, children: [t(LONG)] };
    expect(auditStatesAndMotion(tree({ type: "stack", children: [solid] }))).toEqual([]);
  });
});

describe("page craft integration", () => {
  it("reports findings against the section that has them and asks for a repair", () => {
    const glass: CompositionNode = { type: "card", style: { blur: 8 }, children: [t(LONG)] };
    const grid: CompositionNode = { type: "grid", children: Array.from({ length: 14 }, (_, i) => item(30 + i * 90)) };
    const out = auditPageCraft([
      { id: "plain", role: "about", tree: tree({ type: "stack", children: [h("About"), t("We answer our own phone.")] }) },
      { id: "busy", role: "services", tree: tree({ type: "stack", children: [glass, grid] }) },
    ]);
    expect(out.every((f) => f.sectionId === "busy")).toBe(true);
    expect(codes(out.map((f) => f.finding))).toEqual(expect.arrayContaining(["translucent_text_backing", "motion_too_many_staggered", "motion_stagger_too_long"]));
    expect(needsDesignRepair(out.map((f) => f.finding))).toBe(true);
  });
});
