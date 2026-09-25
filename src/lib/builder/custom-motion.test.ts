import { describe, expect, it } from "vitest";
import { validateComposition } from "./composition-tree";
import { motionStyle } from "@/components/site/CompositionRenderer";

const tree = (motion: unknown) => ({ version: 1, root: { type: "stack", children: [{ type: "heading", level: 1, text: "Hi", motion }] } });

describe("AI-described motion", () => {
  it("keeps a custom motion the AI designs", () => {
    const r = validateComposition(tree({ kind: "custom", from: { y: 40, rotate: -6, opacity: 0 }, easing: "spring", repeat: 2, trigger: "view" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const m = r.tree.root.children![0]!.motion!;
    expect(m).toEqual({ kind: "custom", from: { y: 40, rotate: -6, opacity: 0 }, easing: "spring", repeat: 2, trigger: "view" });
    const css = motionStyle(m) as Record<string, string>;
    expect(css["--rv-y"]).toBe("40px");
    expect(css["--rv-r"]).toBe("-6deg");
    expect(css["animationIterationCount"]).toBe("2");
  });
  it("reports out-of-range values instead of silently dropping them", () => {
    const r = validateComposition(tree({ kind: "custom", from: { x: 9999, spin: 1 }, durationMs: 50 }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const paths = r.issues.map((i) => i.path).join(" ");
    expect(paths).toContain("from.x");
    expect(paths).toContain("from.spin");
    expect(paths).toContain("durationMs");
  });
  it("rejects custom motion with no starting values", () => {
    expect(validateComposition(tree({ kind: "custom" })).ok).toBe(false);
  });
});
