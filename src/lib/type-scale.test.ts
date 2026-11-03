import { describe, expect, it } from "vitest";
import { CINEMATIC_CSS } from "@/components/site/cinematic-css";
import { styleToCss } from "@/components/site/CompositionRenderer";
import { TYPE_RAMP, designSystemCss } from "@/lib/site-design-system";
import {
  DISPLAY_STEPS,
  MAX_CLAMP_RATIO,
  SCENE_HEADLINE_CLAMP,
  TYPE_STEPS,
  TYPE_VIEWPORT_MAX_PX,
  TYPE_VIEWPORT_MIN_PX,
  checkTypeClamp,
  fluidClamp,
  headingClamp,
} from "@/lib/type-scale";

/** Evaluate a rem/vw clamp at a viewport width (px). */
function sizeAt(value: string, viewport: number): number {
  const m = /^clamp\(([\d.]+)rem, ([\d.]+)rem \+ ([\d.]+)vw, ([\d.]+)rem\)$/.exec(value)!;
  expect(m, value).not.toBeNull();
  const [min, a, b, max] = [m[1], m[2], m[3], m[4]].map(Number) as [number, number, number, number];
  return Math.min(max * 16, Math.max(min * 16, a * 16 + (b * viewport) / 100));
}

describe("fluidClamp", () => {
  it("interpolates from min at 320px to max at 2560px with a rem term", () => {
    const v = fluidClamp(17, 19);
    expect(checkTypeClamp(v)).toMatchObject({ ok: true });
    expect(sizeAt(v, TYPE_VIEWPORT_MIN_PX)).toBeCloseTo(17, 0);
    expect(sizeAt(v, TYPE_VIEWPORT_MAX_PX)).toBeCloseTo(19, 0);
    expect(sizeAt(v, 1440)).toBeGreaterThan(17);
    expect(sizeAt(v, 1440)).toBeLessThan(19);
  });

  it("raises the floor (never lowers the ceiling) when the range is wider than 2.5×", () => {
    const v = fluidClamp(16, 120);
    const c = checkTypeClamp(v);
    expect(c.ok).toBe(true);
    expect(c.max).toBe(120);
    expect(c.min).toBeCloseTo(120 / MAX_CLAMP_RATIO, 1);
  });

  it("always keeps a rem term, even for a flat size", () => {
    expect(fluidClamp(24, 24)).toMatch(/1\.5rem \+ 0vw/);
  });
});

describe("checkTypeClamp", () => {
  it("rejects a pure-vw preferred value and a range wider than 2.5×", () => {
    expect(checkTypeClamp("clamp(3.2rem,7vw,6.5rem)").problems).toContain("preferred value has no rem term (ignores zoom)");
    expect(checkTypeClamp("clamp(12px, 1rem + 4vw, 96px)").problems[0]).toMatch(/more than 2.5×/);
    expect(checkTypeClamp("18px").ok).toBe(true);
  });
});

describe("every fluid size the renderer emits passes the guardrails", () => {
  it("modular steps and the display register", () => {
    for (const [name, value] of Object.entries({ ...TYPE_STEPS, ...DISPLAY_STEPS })) expect(checkTypeClamp(value), name).toMatchObject({ ok: true });
    expect(Object.keys(TYPE_STEPS)).toHaveLength(9);
    expect(sizeAt(TYPE_STEPS["--ds-step-0"]!, 320)).toBeCloseTo(17, 0);
    expect(sizeAt(TYPE_STEPS["--ds-step-7"]!, 2560)).toBeCloseTo(19 * 1.25 ** 7, 0);
  });

  it("the existing design-system ramp (unchanged values) already complies", () => {
    for (const [step, value] of Object.entries(TYPE_RAMP)) expect(checkTypeClamp(value), step).toMatchObject({ ok: true });
  });

  it("composition headings: authored size is the ceiling, reached by 1440px, zoom-safe", () => {
    for (const size of [18, 28, 40, 64, 96, 140]) {
      const css = styleToCss({ size }, "heading");
      expect(css.fontSize).toBe(headingClamp(size));
      expect(checkTypeClamp(String(css.fontSize)), String(size)).toMatchObject({ ok: true });
      expect(sizeAt(String(css.fontSize), 1440)).toBeCloseTo(size, 0);
    }
    expect(styleToCss({ size: 18 }, "text").fontSize).toBe(18);
  });

  it("the cinematic scene headline and the stylesheet tokens", () => {
    expect(checkTypeClamp(SCENE_HEADLINE_CLAMP)).toMatchObject({ ok: true });
    expect(sizeAt(SCENE_HEADLINE_CLAMP, 320)).toBeCloseTo(51.2, 0);
    expect(CINEMATIC_CSS).toContain(`font-size:${SCENE_HEADLINE_CLAMP}!important`);
    const sheet = designSystemCss();
    for (const name of [...Object.keys(TYPE_STEPS), ...Object.keys(DISPLAY_STEPS)]) expect(sheet).toContain(`${name}:`);
    for (const m of CINEMATIC_CSS.matchAll(/font-size:(clamp\([^;!}]*\))/g)) expect(checkTypeClamp(m[1]!), m[1]).toMatchObject({ ok: true });
  });
});

describe("320px headline register", () => {
  it("phones change tracking/leading; ≤359px lightens weight instead of shrinking the size", () => {
    const narrow = CINEMATIC_CSS.match(/@media \(max-width:22\.49rem\)\{([^\n]*)\}/)?.[1] ?? "";
    expect(narrow).toContain("font-weight:min(var(--ds-heading-weight,700),650)");
    expect(narrow).not.toContain("font-size");
    const phone = CINEMATIC_CSS.match(/@media \(max-width:47\.99rem\)\{[^\n]*rv-scene :is\(h1,h2\)[^\n]*\}/)?.[0] ?? "";
    expect(phone).toContain("letter-spacing:-.028em");
    expect(phone).not.toContain("font-size");
  });
});
