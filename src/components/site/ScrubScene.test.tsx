import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompositionRenderer } from "@/components/site/CompositionRenderer";
import { CINEMATIC_CSS } from "@/components/site/cinematic-css";
import { validateComposition } from "@/lib/builder/composition-tree";

const REFS = { allowedMediaRefs: new Set(["temp_one"]) };
const scene = (extra: Record<string, unknown> = {}) => ({
  type: "scene",
  ...extra,
  children: [{ type: "media", mediaRef: "temp_one", alt: "The polo" }, { type: "heading", level: 2, text: "Tailored from shadow" }],
});
const tree = (root: unknown) => {
  const result = validateComposition({ version: 1, root }, REFS);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.tree;
};
const render = (root: unknown, url: string) =>
  sectionMarkup(renderToStaticMarkup(<CompositionRenderer tree={tree(root)} scope="t" resolveMedia={() => url} />));
// The shared stylesheet is emitted before the section and names every class; assert on the markup only.
const sectionMarkup = (rendered: string) => rendered.slice(rendered.indexOf("<section data-composition"));

describe("scene scrub", () => {
  it("wraps a video scene in a scrolling track whose video never plays or loops", () => {
    const html = render({ type: "stack", children: [scene({ scrub: true })] }, "/clip.mp4");
    expect(html).toContain("rv-scrub");
    expect(html).toContain("<video");
    expect(html).not.toMatch(/autoplay|loop/i);
    expect(html).toContain("muted");
    expect(html).toContain("Tailored from shadow");
    // tall and pinned only after hydration (data-live), never in the static markup
    expect(html).not.toContain("data-live");
    expect(CINEMATIC_CSS).toMatch(/\.rv-scrub\[data-live\]\{height:300vh/);
    expect(CINEMATIC_CSS).toMatch(/\.rv-scrub\[data-live\] > \.rv-scene\{position:sticky/);
  });

  it("ignores scrub for a picture backdrop", () => {
    const html = render({ type: "stack", children: [scene({ scrub: true })] }, "/still.jpg");
    expect(html).not.toContain("rv-scrub");
    expect(html).toContain("<img");
  });

  it("is only accepted on a scene, as a boolean, and not inside scroll_chapters", () => {
    const check = (root: unknown) => validateComposition({ version: 1, root }, REFS).ok;
    expect(check({ type: "stack", children: [scene({ scrub: true })] })).toBe(true);
    expect(check({ type: "stack", children: [{ type: "text", text: "x", scrub: true }] })).toBe(false);
    expect(check({ type: "stack", children: [scene({ scrub: "yes" })] })).toBe(false);
    expect(check({ type: "scroll_chapters", children: [scene({ scrub: true }), scene()] })).toBe(false);
  });
});
