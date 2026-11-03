import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompositionRenderer } from "./CompositionRenderer";
import { validateComposition, type CompositionTree } from "@/lib/builder/composition-tree";
import { DETAILER_HERO_STAGE, MED_SPA_HERO_STAGE, PLUMBER_HERO_STAGE } from "@/lib/builder/cinematic-hero-stage.fixtures";
import type { PersistedComponentVisual } from "@/lib/site-style";

const valid = (heroStage: unknown): CompositionTree => {
  const r = validateComposition({ version: 1, root: { type: "cinematic_hero_stage", heroStage } });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.tree;
};
const render = (tree: CompositionTree, resolveMedia?: (ref: string) => { url: string; visual?: PersistedComponentVisual } | null) =>
  renderToStaticMarkup(<CompositionRenderer tree={tree} scope="hs" {...(resolveMedia ? { resolveMedia } : {})} />);

describe("CinematicHeroStage server render", () => {
  it("paints the detailer's copy in one h1, its first frame visible, and no stamp", () => {
    const html = render(valid(DETAILER_HERO_STAGE));
    expect(html.match(/<h1/g)?.length).toBe(1);
    expect(html).toContain("Your paint, under a");
    expect(html).toMatch(/<em class="rv-hs-em" data-effect="clip-wipe">light<\/em>/);
    expect(html).toContain('href="/book"');
    expect(html).toContain('alt="Detailer&#x27;s bay, before correction"');
    expect(html.match(/data-hs-frame=""/g)?.length).toBe(6);
    expect(html).not.toContain("revora · macrostructure");
    expect(html).toContain('data-hs="hero-detailing-01"');
    expect(html).toContain('data-pin="medium"');
  });

  it("draws the plumber's route as an undrawn SVG path at load", () => {
    const html = render(valid(PLUMBER_HERO_STAGE));
    expect(html).toContain('d="M 12 78 C 26 64, 34 60, 44 52 S 58 40, 66 30 S 78 22, 88 18"');
    expect(html).toMatch(/stroke-dashoffset:1/);
    expect(html).toContain("We don&#x27;t guess where the water is coming from.");
  });

  it("drops generated or stock frames when the stage promises real product pixels", () => {
    const s = JSON.parse(JSON.stringify(MED_SPA_HERO_STAGE));
    s.layers[1].frames = s.layers[1].frames.map((f: { alt: string }, i: number) => ({ mediaRef: `temp_room_${i}`, alt: f.alt }));
    const tree = valid(s);
    const real = render(tree, (ref) => ({ url: `https://cdn.revora.test/${ref}.webp`, visual: { source: "customer" } as PersistedComponentVisual }));
    expect(real.match(/data-hs-frame=""/g)?.length).toBe(4);
    const generated = render(tree, (ref) => ({ url: `https://cdn.revora.test/${ref}.webp`, visual: { source: ref.endsWith("0") ? "generated" : "customer" } as PersistedComponentVisual }));
    expect(generated).not.toContain("data-hs-frame");
    expect(generated).toContain("The quietest hour of your month.");
  });
});
