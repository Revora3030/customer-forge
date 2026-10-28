import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompositionRenderer } from "@/components/site/CompositionRenderer";
import { CINEMATIC_CSS } from "@/components/site/cinematic-css";
import { validateComposition } from "@/lib/builder/composition-tree";

const REFS = { allowedMediaRefs: new Set(["temp_a", "temp_b", "temp_c"]) };
const layer = (ref: string, alt = "Layer") => ({ type: "media", mediaRef: ref, alt });
const root = (kids: unknown[]) => ({ type: "stack", children: [{ type: "parallax_layers", children: kids }] });

describe("parallax_layers", () => {
  it("renders every layer back to front with its depth, only the back layer is announced", () => {
    const result = validateComposition({ version: 1, root: root([layer("temp_a", "Skyline"), layer("temp_b", "Cut-out")]) }, REFS);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    // The shared stylesheet is emitted before the section and names every class; assert on the markup only.
    const rendered = renderToStaticMarkup(<CompositionRenderer tree={result.tree} scope="t" resolveMedia={(ref) => `/${ref}.png`} />);
    const html = rendered.slice(rendered.indexOf("<section data-composition"));
    expect(html.match(/rv-px-layer/g)).toHaveLength(2);
    expect(html.indexOf("/temp_a.png")).toBeLessThan(html.indexOf("/temp_b.png"));
    expect(html).toContain('data-depth="1"');
    expect(html).toContain('alt="Skyline"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("Cut-out");
  });

  it("moves only where scroll timelines exist and motion is allowed", () => {
    expect(CINEMATIC_CSS).toMatch(/@supports \(animation-timeline:view\(\)\)\{@media \(prefers-reduced-motion:no-preference\)\{[^`]*rv-px-layer\{animation:rv-px-drift linear both;animation-timeline:--rv-px/);
    expect(CINEMATIC_CSS).toMatch(/\.rv-px\{[^}]*overflow:clip/);
  });

  it("needs 2-4 pictures", () => {
    const ok = (kids: unknown[]) => validateComposition({ version: 1, root: root(kids) }, REFS).ok;
    expect(ok([layer("temp_a"), layer("temp_b")])).toBe(true);
    expect(ok([layer("temp_a")])).toBe(false);
    expect(ok([layer("temp_a"), layer("temp_b"), layer("temp_c"), layer("temp_a"), layer("temp_b")])).toBe(false);
    expect(ok([layer("temp_a"), { type: "text", text: "x" }])).toBe(false);
  });
});
