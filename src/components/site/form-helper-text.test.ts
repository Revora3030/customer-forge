import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { FORM_HELPER_STRENGTH, FORM_HELPER_TEXT } from "@/components/site/form-helper-text";
import { contrastRatio, toRgb } from "@/lib/readable-color";

/** What `color-mix(in srgb, ink S%, transparent)` paints over `surface`. */
function painted(ink: string, surface: string, strength: number): string {
  const a = toRgb(ink)!;
  const b = toRgb(surface)!;
  const k = strength / 100;
  const mix = (x: number, y: number) => Math.round(x * k + y * (1 - k));
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(mix(a.r, b.r))}${hex(mix(a.g, b.g))}${hex(mix(a.b, b.b))}`;
}

describe("form small print colour (Elite 390 QA: 1.59 to 2.26:1)", () => {
  it("is the form's own ink at the stated strength, as one literal Tailwind can see", () => {
    expect(FORM_HELPER_TEXT).toBe(`[color:color-mix(in_srgb,currentColor_${FORM_HELPER_STRENGTH}%,transparent)]`);
    expect(FORM_HELPER_TEXT).not.toContain("muted");
  });

  it.each([
    ["dark green card, warm white ink", "#f4efe6", "#173126"],
    ["near-black card, white ink", "#ffffff", "#101114"],
    ["white card, dark ink", "#14161a", "#ffffff"],
    ["cream card, brown ink", "#2b2118", "#f7f1e4"],
    ["navy panel, light ink", "#e8eefc", "#0e1a3a"],
  ])("clears 4.5:1 on a %s", (_name, ink, surface) => {
    expect(contrastRatio(ink, surface)!).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(painted(ink, surface, FORM_HELPER_STRENGTH), surface)!).toBeGreaterThanOrEqual(4.5);
  });

  it("no helper or consent line in SiteForms still uses the theme muted grey", () => {
    const src = readFileSync("src/components/site/SiteForms.tsx", "utf8");
    expect(src).not.toContain("text-muted-foreground");
    expect(src).toContain("${FORM_HELPER_TEXT}");
  });
});
