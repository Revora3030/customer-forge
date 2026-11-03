/**
 * The CSS craft engine: static grain, clip-path wipes, and a body-text scrim
 * floor. Zero tokens and zero runtime script; these lock the guarantees.
 */
import { describe, expect, it } from "vitest";
import { CINEMATIC_CSS } from "./cinematic-css";
import { GRAIN_LAYER_CSS, GRAIN_OPACITY, GRAIN_URL } from "./film-grain";
import { BODY_SCRIM_MIN_OPACITY, MAX_SCRIM_OPACITY, sceneScrim, worstSceneContrast } from "@/lib/builder/cinematic-primitives";

const keyframes = (name: string) => CINEMATIC_CSS.match(new RegExp(`@keyframes ${name}\\{(.*?)\\}\\}`))?.[1] ?? "";

describe("film grain", () => {
  it("is a static SVG feTurbulence tile at a subtle opacity", () => {
    const svg = decodeURIComponent(GRAIN_URL.slice('url("data:image/svg+xml,'.length, -2));
    expect(svg).toContain("<feTurbulence");
    expect(svg).toContain("stitchTiles='stitch'");
    expect(GRAIN_OPACITY).toBeGreaterThanOrEqual(0.12);
    expect(GRAIN_OPACITY).toBeLessThanOrEqual(0.16);
    expect(GRAIN_LAYER_CSS).toContain("pointer-events:none");
    expect(GRAIN_LAYER_CSS).not.toMatch(/animation|transition/);
  });

  it("sits on photographic scenes and scrub stages, and is hidden in print and forced colours", () => {
    expect(CINEMATIC_CSS).toContain(".rv-scene:has(> .rv-scene-scrim)::after{" + GRAIN_LAYER_CSS + ";z-index:-1}");
    expect(CINEMATIC_CSS).toContain(".rv-seq-stage::after{" + GRAIN_LAYER_CSS + ";z-index:2}");
    expect(CINEMATIC_CSS).toMatch(/@media print,\(forced-colors:active\)\{[^}]*\.rv-scene::after[^}]*display:none/);
  });
});

describe("clip-path wipes", () => {
  it("tier cards reveal with an inset() wipe instead of an opacity fade", () => {
    const tier = keyframes("rv-tier-in");
    expect(tier).toContain("clip-path:inset(0 100% 0 0");
    expect(tier).not.toContain("opacity");
  });

  it("scene frames wipe up on scroll, only with scroll timelines and no reduced-motion preference", () => {
    expect(keyframes("rv-wipe-up")).toContain("clip-path:inset(18% 0 0 0)");
    const gated = CINEMATIC_CSS.slice(CINEMATIC_CSS.indexOf("@media (prefers-reduced-motion: no-preference){\n@supports (animation-timeline: view()){"));
    expect(gated.slice(0, gated.indexOf("\n}\n"))).toContain("animation:rv-wipe-up");
    expect(CINEMATIC_CSS).toMatch(/@media \(prefers-reduced-motion:reduce\)\{[^}]*rv-tier-card\[data-on\]\{animation:none\}/);
  });
});

describe("body-text scrim floor", () => {
  it("never paints body copy on less than 0.72 alpha, even when contrast math would allow less", () => {
    expect(BODY_SCRIM_MIN_OPACITY).toBeGreaterThanOrEqual(72);
    const thin = sceneScrim({ ink: "#ffffff", scrim: "#000000", opacity: 10 });
    expect(thin.opacity).toBeGreaterThanOrEqual(0.72);
    expect(sceneScrim({}).opacity).toBeGreaterThanOrEqual(0.72);
    expect(worstSceneContrast(thin.ink, thin.scrim, thin.opacity)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps a higher authored opacity and the safety ceiling", () => {
    expect(sceneScrim({ ink: "#ffffff", scrim: "#000000", opacity: 88 }).opacity).toBeCloseTo(0.88, 5);
    expect(sceneScrim({ ink: "#ffffff", scrim: "#000000", opacity: 100 }).opacity).toBeLessThanOrEqual(MAX_SCRIM_OPACITY / 100);
  });

  it("large display text keeps the contrast-solved value (3:1 target)", () => {
    const large = sceneScrim({ ink: "#ffffff", scrim: "#000000", opacity: 10, large: true });
    expect(large.opacity).toBeLessThan(0.72);
    expect(large.contrast).toBeGreaterThanOrEqual(3);
  });
});
