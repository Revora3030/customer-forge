/**
 * The CSS craft engine: static grain, clip-path wipes, and a body-text scrim
 * floor. Zero tokens and zero runtime script; these lock the guarantees.
 */
import { describe, expect, it } from "vitest";
import { CINEMATIC_CSS } from "./cinematic-css";
import { GRAIN_LAYER_CSS, GRAIN_OPACITY, GRAIN_URL } from "./film-grain";
import { BODY_SCRIM_MIN_OPACITY, MAX_SCRIM_OPACITY, sceneScrim, worstSceneContrast } from "@/lib/builder/cinematic-primitives";

/** Block preludes ("@media …", "@supports …", selectors) enclosing each occurrence of `needle`. */
function enclosingBlocks(css: string, needle: string): string[][] {
  const out: string[][] = [];
  const stack: string[] = [];
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "{") { stack.push(css.slice(start, i).trim()); start = i + 1; }
    else if (c === "}") { stack.pop(); start = i + 1; }
    else if (c === ";") start = i + 1;
    else if (css.startsWith(needle, i) && (css[i - 1] === "{" || css[i - 1] === ";")) out.push([...stack]);
  }
  return out;
}

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

import { CRAFT_BODY_SCRIM_FLOOR, CRAFT_ENGINE_CSS, CRAFT_LAYER_ORDER, OBSIDIAN_TOKENS, SCRIM_ALPHA } from "./craft-engine-css";

describe("layered craft sheet (round-7 spec, adapted)", () => {
  it("declares the layer order first, with names that cannot merge into Tailwind's base", () => {
    expect(CRAFT_ENGINE_CSS.startsWith("@layer rv-tokens,rv-base,rv-craft,rv-motion,rv-tenant;")).toBe(true);
    expect(CRAFT_LAYER_ORDER.every((name) => name.startsWith("rv-"))).toBe(true);
  });

  it("never restyles :root, html or body, and never forces a dark colour scheme on a tenant", () => {
    expect(CRAFT_ENGINE_CSS).not.toMatch(/(^|[\s{},])(:root|html|body)\s*\{/m);
    expect(CRAFT_ENGINE_CSS).not.toContain("color-scheme");
  });

  it("ships OKLCH obsidian tokens with hex fallbacks", () => {
    for (const [name, [oklch, fallback]] of Object.entries(OBSIDIAN_TOKENS)) {
      expect(oklch).toMatch(/^oklch\(/);
      expect(CRAFT_ENGINE_CSS).toContain(`${name}:${fallback}`);
      expect(CRAFT_ENGINE_CSS).toContain(`${name}:${oklch}`);
    }
    expect(CRAFT_ENGINE_CSS.indexOf("@supports (color:oklch(0 0 0))")).toBeGreaterThan(CRAFT_ENGINE_CSS.indexOf("--rv-void:#121318"));
  });

  it("body scrims are at least 0.72 alpha", () => {
    expect(SCRIM_ALPHA.strong).toBeGreaterThanOrEqual(0.72);
    expect(CRAFT_BODY_SCRIM_FLOOR).toBeGreaterThanOrEqual(0.72);
    for (const dir of ["to-top", "to-bottom", "to-right"]) {
      const rule = CRAFT_ENGINE_CSS.match(new RegExp(`\\.rv-scrim--${dir}\\{([^}]*)\\}`))?.[1] ?? "";
      expect(rule, dir).toMatch(/var\(--rv-scrim-strong\) 0%,var\(--rv-scrim-strong\) 55%/);
    }
  });

  it("animation-timeline only under @supports, all motion under no-preference, no will-change", () => {
    const motion = CRAFT_ENGINE_CSS.slice(CRAFT_ENGINE_CSS.indexOf("@layer rv-motion{"));
    expect(motion.startsWith("@layer rv-motion{\n@media (prefers-reduced-motion:no-preference){")).toBe(true);
    expect(CRAFT_ENGINE_CSS).not.toContain("will-change");
    for (const sheet of [CRAFT_ENGINE_CSS, CINEMATIC_CSS]) {
      expect(enclosingBlocks(sheet, "animation-timeline:").length).toBeGreaterThan(1);
      for (const stack of enclosingBlocks(sheet, "animation-timeline:")) {
        expect(stack.some((p) => p.startsWith("@supports") && p.includes("animation-timeline")), stack.join(" > ")).toBe(true);
        expect(stack.some((p) => /prefers-reduced-motion: ?no-preference/.test(p)), stack.join(" > ")).toBe(true);
      }
    }
  });

  it("the grain overlay is static and the same tile as the scene grain", () => {
    const grain = CRAFT_ENGINE_CSS.match(/\.rv-grain\{([^}]*)\}/)?.[1] ?? "";
    expect(grain).toContain(GRAIN_URL);
    expect(grain).toContain("pointer-events:none");
    expect(grain).not.toMatch(/animation|transition/);
  });
});
