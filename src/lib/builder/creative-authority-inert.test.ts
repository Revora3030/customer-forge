import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { blankDesignFingerprint } from "@/lib/builder/design-fingerprint";

const src = readFileSync("src/lib/builder/creative-authority.ts", "utf8");

describe("design compiler makes no creative choices", () => {
  it("does not derive columns, nav, CTA stacking, crop or type scale per width", () => {
    expect(src).not.toMatch(/columns: phone|nav: phone|typeScale: width|imageCrop: phone|sticky_bar/);
    expect(src).not.toMatch(/sort\(\(a, b\) => a\.emphasis - b\.emphasis\)/);
  });
  it("places the primary action only where the AI asked", () => {
    expect(src).not.toMatch(/\/cta\|quote\|booking\|contact\/i\.test\(section\.role\)/);
    expect(src).toContain('includes?.includes("primary_action")');
  });
  it("the blank design record carries no layout opinion", () => {
    const fp = blankDesignFingerprint();
    for (const key of ["heroComposition", "navSystem", "ctaSystem", "cardSystem", "pageShell", "imageTreatment"] as const)
      expect(fp[key]).toBe("unspecified");
  });
});
