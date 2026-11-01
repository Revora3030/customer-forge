import { describe, expect, it } from "vitest";
import { VARIANT_COUNTS, hashSeed, pickVariant, type SectionVariantGroup } from "./section-variants";

const groups = Object.keys(VARIANT_COUNTS) as SectionVariantGroup[];

describe("pickVariant", () => {
  it("is deterministic for the same seed, group and section", () => {
    for (const group of groups) {
      expect(pickVariant(group, "sec-1", "acme-plumbing")).toBe(pickVariant(group, "sec-1", "acme-plumbing"));
    }
  });

  it("falls back to the default layout without a usable seed", () => {
    for (const group of groups) {
      expect(pickVariant(group, "sec-1")).toBe(0);
      expect(pickVariant(group, "sec-1", null)).toBe(0);
      expect(pickVariant(group, "sec-1", "   ")).toBe(0);
    }
  });

  it("always returns an index inside the group's range, and reaches every variant", () => {
    for (const group of groups) {
      const seen = new Set<number>();
      for (let i = 0; i < 200; i++) {
        const picked = pickVariant(group, `section-${i}`, `site-${i * 7}`);
        expect(picked).toBeGreaterThanOrEqual(0);
        expect(picked).toBeLessThan(VARIANT_COUNTS[group]);
        seen.add(picked);
      }
      expect(seen.size).toBe(VARIANT_COUNTS[group]);
    }
  });

  it("differs between sites so builds do not all look alike", () => {
    const picks = new Set<number>();
    for (let i = 0; i < 40; i++) picks.add(pickVariant("hero", "same-section", `business-${i}`));
    expect(picks.size).toBeGreaterThan(1);
  });

  it("hashes the same text to the same unsigned 32-bit number", () => {
    expect(hashSeed("revora")).toBe(hashSeed("revora"));
    expect(hashSeed("revora")).toBeGreaterThanOrEqual(0);
    expect(hashSeed("revora")).toBeLessThan(2 ** 32);
  });
});
