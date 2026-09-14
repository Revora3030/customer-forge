import { describe, expect, it } from "vitest";
import { experienceAudit } from "./experience-audit";

describe("experience audit", () => {
  it("flags missing mobile conversion affordances", () => {
    const result = experienceAudit({ sectionCount: 10, componentCount: 30, hasStickyCta: false, hasImages: true, hasPhone: true, hasEmail: true, hasHero: true });
    expect(result.priorities).toContain("mobile_cta");
  });

  it("penalizes excessive complexity", () => {
    const result = experienceAudit({ sectionCount: 20, componentCount: 80, hasStickyCta: false, hasImages: true, hasPhone: false, hasEmail: false, hasHero: false });
    expect(result.mobile).toBeLessThan(80);
    expect(result.performance).toBeLessThan(80);
    expect(result.priorities).toEqual(expect.arrayContaining(["performance", "mobile", "accessibility"]));
  });
});
