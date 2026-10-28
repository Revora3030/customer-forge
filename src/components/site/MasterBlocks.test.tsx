import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { validateComposition } from "@/lib/builder/composition-tree";
import { INTERACTIVE_PRIMITIVES, COMPOSITION_PRIMITIVES } from "@/lib/builder/composition-tree";
import { LensMagnifier, StickySplitStory, TierFader } from "@/components/site/MasterBlocks";
import { CINEMATIC_CSS } from "@/components/site/cinematic-css";

const REFS = { allowedMediaRefs: new Set(["temp_one"]) };
const props = { "data-cn": "t-1", "data-motion": undefined, className: undefined, style: {} };

describe("lens_magnifier and sticky_split_story", () => {
  it("are registered and count towards the home page's interactive centrepiece", () => {
    for (const name of ["lens_magnifier", "sticky_split_story"]) {
      expect(COMPOSITION_PRIMITIVES).toContain(name);
      expect(INTERACTIVE_PRIMITIVES.has(name)).toBe(true);
    }
  });

  it("lens: renders the whole picture first, with a keyboard-focusable stage and a 44px touch switch", () => {
    const html = renderToStaticMarkup(<LensMagnifier props={props} src="/a.jpg" alt="Clear coat" prompt="Inspect the finish" />);
    expect(html).toContain('alt="Clear coat"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain("Magnify on touch");
    expect(html).not.toContain("rv-lens-loupe");
    expect(CINEMATIC_CSS).toMatch(/\.rv-lens-touch\{min-height:44px/);
  });

  it("split story: picture then phases in order, pinned only on wide screens", () => {
    const html = renderToStaticMarkup(<StickySplitStory props={props} picture={<img alt="Wall" src="/w.jpg" />} phases={[<p key="a">Prep</p>, <p key="b">Seal</p>]} />);
    expect(html.indexOf("rv-split-pin")).toBeLessThan(html.indexOf("rv-split-phases"));
    expect(html.match(/rv-split-phase"/g)).toHaveLength(2);
    expect(CINEMATIC_CSS).toMatch(/@media \(min-width:768px\)\{[^`]*\.rv-split-pin\{position:sticky/);
  });

  it("validator: lens needs exactly one real (mediaRef) photo", () => {
    const tree = (kids: unknown[]) => validateComposition({ version: 1, root: { type: "stack", children: [{ type: "lens_magnifier", text: "Inspect", children: kids }] } }, REFS);
    expect(tree([{ type: "media", mediaRef: "temp_one", alt: "Paint" }]).ok).toBe(true);
    expect(tree([{ type: "media", src: "https://x.test/a.jpg", alt: "Paint" }]).ok).toBe(false);
    expect(tree([]).ok).toBe(false);
  });

  it("validator: split story needs a picture first and 2-6 non-picture phases", () => {
    const tree = (kids: unknown[]) => validateComposition({ version: 1, root: { type: "stack", children: [{ type: "sticky_split_story", children: kids }] } }, REFS);
    const pic = { type: "media", mediaRef: "temp_one", alt: "Wall" };
    const phase = (t: string) => ({ type: "stack", children: [{ type: "heading", text: t }, { type: "text", text: "Owner-supplied step." }] });
    expect(tree([pic, phase("Prep"), phase("Rinse"), phase("Seal")]).ok).toBe(true);
    expect(tree([pic, phase("Prep")]).ok).toBe(false);
    expect(tree([phase("Prep"), phase("Rinse"), phase("Seal")]).ok).toBe(false);
  });

  it("tier fader: lists every package without JavaScript, with a 44px labelled slider", () => {
    const html = renderToStaticMarkup(<TierFader props={props} label="Choose your package" labels={["Good", "Better", "Best"]} cards={[<p key="a">Wash</p>, <p key="b">Wash + wax</p>, <p key="c">Full detail</p>]} />);
    expect(html.match(/rv-tier-card"/g)).toHaveLength(3);
    expect(html).not.toContain("data-hidden");
    expect(html).toContain('aria-valuetext="Good"');
    expect(html).toContain("Choose your package");
    expect(CINEMATIC_CSS).toMatch(/\.rv-tier-range\{width:100%;min-height:44px/);
    expect(CINEMATIC_CSS).toMatch(/\.rv-tier-range\{[^}]*touch-action:pan-y/);
  });

  it("validator: tier fader needs 2-4 offer cards, and never a typed price", () => {
    const card = (t: string) => ({ type: "offer_card", text: t, service: t, children: [{ type: "button", text: "Book", href: "#booking" }] });
    const tree = (kids: unknown[]) => validateComposition({ version: 1, root: { type: "stack", children: [{ type: "service_tier_fader", text: "Choose", children: kids }] } });
    expect(tree([card("Basic wash"), card("Full detail")]).ok).toBe(true);
    expect(tree([card("Basic wash")]).ok).toBe(false);
    expect(tree([card("A"), { type: "text", text: "x" }]).ok).toBe(false);
    expect(tree([card("A"), { ...card("B"), text: "Full detail $199" }]).ok).toBe(false);
  });
});
