import { describe, expect, it } from "vitest";
import { parseHeroStage, type CinematicHeroStage } from "@/lib/builder/cinematic-hero-stage";
import { DETAILER_HERO_STAGE, MED_SPA_HERO_STAGE, PLUMBER_HERO_STAGE } from "@/lib/builder/cinematic-hero-stage.fixtures";
import { HERO_STAGE_CSS, stackOpacities, stageCss, stageFrame, tokenColor, windowProgress } from "@/lib/builder/hero-stage-motion";

const parse = (raw: unknown): CinematicHeroStage => {
  const r = parseHeroStage(raw);
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.stage;
};

describe("hero stage motion maths", () => {
  it("maps progress into a step window", () => {
    expect(windowProgress(0, [0.1, 0.9])).toBe(0);
    expect(windowProgress(0.5, [0.1, 0.9])).toBeCloseTo(0.5);
    expect(windowProgress(1, [0.1, 0.9])).toBe(1);
  });

  it("holds each frame before the next fades in over it", () => {
    expect(stackOpacities(4, 0, 0.5)).toEqual([1, 0, 0, 0]);
    expect(stackOpacities(4, 0.4, 0.5)).toEqual([1, 0, 0, 0]);
    expect(stackOpacities(4, 0.75, 0.5)).toEqual([1, 0.5, 0, 0]);
    expect(stackOpacities(4, 3, 0.5)).toEqual([1, 1, 1, 1]);
  });

  it("starts the detailer on its first frame and ends on its last, with the sweep travelling", () => {
    const stage = parse(DETAILER_HERO_STAGE);
    const start = stageFrame(stage, 0);
    const end = stageFrame(stage, 1);
    expect(start["paint"]?.frames).toEqual([1, 0, 0, 0, 0, 0]);
    expect(end["paint"]?.frames).toEqual([1, 1, 1, 1, 1, 1]);
    expect(start["sweep"]?.transform).toBe("translateX(-30%)");
    expect(end["sweep"]?.transform).toBe("translateX(130%)");
    expect(end["amb-1"]?.transform).toBe("translateY(-18px)");
  });

  it("draws the plumber's route with the scroll, and fully for a static poster", () => {
    const stage = parse(PLUMBER_HERO_STAGE);
    expect(stageFrame(stage, 0)["route"]?.dashOffset).toBe(1);
    expect(stageFrame(stage, 1)["route"]?.dashOffset).toBe(0);
    expect(stageFrame(stage, 0, { drawPaths: true })["route"]?.dashOffset).toBe(0);
    expect(stageFrame(stage, 0)["wall"]?.transform).toBe("scale(1.06)");
  });
});

describe("hero stage CSS", () => {
  const all = [DETAILER_HERO_STAGE, PLUMBER_HERO_STAGE, MED_SPA_HERO_STAGE].map(parse);

  it("is scoped to the stage, never :root, and animates only without reduced motion", () => {
    for (const stage of all) {
      const css = stageCss(stage);
      expect(css).not.toContain(":root");
      expect(css).not.toMatch(/expression|javascript|url\(/i);
      const reveal = css.indexOf("animation:rv-hs-");
      if (reveal >= 0) expect(css.lastIndexOf("@media (prefers-reduced-motion: no-preference)", reveal)).toBeGreaterThanOrEqual(0);
    }
    expect(HERO_STAGE_CSS).not.toContain(":root");
  });

  it("hides disableOnMobile and unlisted layers only on narrow screens", () => {
    const css = stageCss(all[0]!);
    const narrow = css.slice(0, css.indexOf("@media (min-width:48rem)"));
    expect(narrow).toContain('[data-hs="hero-detailing-01"] [data-hs-layer="sweep"]');
    expect(narrow).toContain('[data-hs-layer="amb-1"]');
    const wide = css.slice(css.indexOf("@media (min-width:80rem)"));
    expect(wide.split("@supports")[0]).not.toContain("display:none");
  });

  it("guards colour-mix paint behind @supports with a plain fallback", () => {
    const css = stageCss(all[0]!);
    expect(css).toMatch(/\[data-hs-layer="scrim"\]\{background:linear-gradient\(to top, rgb\(8 9 12 \/ 78%\)/);
    expect(css).toContain("@supports (color: color-mix(in srgb, red 50%, transparent))");
  });

  it("resolves tokens with a fallback and refuses anything else", () => {
    expect(tokenColor("var(--amber-04)")).toBe("var(--amber-04, #d4a24c)");
    expect(tokenColor("red")).toBe("transparent");
  });
});
