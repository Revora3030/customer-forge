import { describe, expect, it } from "vitest";
import { validateComposition } from "@/lib/builder/composition-tree";
import { repairBriefFrom } from "@/components/app/VisualCheckPanel";

describe("root blocker regressions", () => {
  it("rejects an over-long composition label instead of silently trimming it", () => {
    const result = validateComposition({ version: 1, label: "x".repeat(121), root: { type: "stack", children: [] } });
    expect(result.ok).toBe(false);
  });

  it("builds an AI repair brief from every measured browser finding", () => {
    const brief = repairBriefFrom({
      score: 60,
      passed: false,
      widths: [390],
      findings: [
        { page: "home", detail: "Text overflows at 390px.", fix: "Let it wrap." },
        { page: "services", detail: "Button too small.", fix: "Enlarge it." },
      ] as never,
    });
    expect(brief).toContain("[home] Text overflows at 390px.");
    expect(brief).toContain("[services] Button too small.");
    expect(brief).toContain("Do not remove anything");
  });
});

import { validateComposition as vc2 } from "./composition-tree";
import { styleToCss as css2 } from "@/components/site/CompositionRenderer";
describe("expanded composition vocabulary", () => {
  it("keeps layering, grid areas and new motion through validation and rendering", () => {
    const r = vc2({ version: 1, root: { type: "grid", style: { gridAreas: '"media copy"', position: "sticky", top: 0, zIndex: 5 }, children: [
      { type: "text", text: "Hi", style: { area: "copy", overlap: 80, blur: 12 }, motion: { kind: "slide-left", durationMs: 900 } },
    ] } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.tree.root.children![0]!;
    expect(c.motion).toEqual({ kind: "slide-left", durationMs: 900 });
    const g = css2(r.tree.root.style, "grid");
    expect(g.gridTemplateAreas).toBe('"media copy"');
    expect(g.position).toBe("sticky");
    expect(css2(c.style, "text").marginTop).toBe(-80);
  });
  it("rejects unsafe grid areas", () => {
    expect(vc2({ version: 1, root: { type: "grid", style: { gridAreas: "url(x)" } } }).ok).toBe(false);
  });
});
