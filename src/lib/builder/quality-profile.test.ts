import { describe, expect, it } from "vitest";
import { qualityProfile } from "./quality-profile";

describe("builder quality profile", () => {
  it("surfaces weak dimensions as priorities", () => {
    const profile = qualityProfile({
      completeness: 70,
      conversionReadiness: 60,
      contentReadiness: 75,
      missingMobileCta: true,
      missingTrust: true,
      missingFaq: true,
      missingHomeHero: false,
    });
    expect(profile.overall).toBeLessThan(85);
    expect(profile.priorities).toEqual(expect.arrayContaining(["conversion", "mobile", "trust", "faq"]));
  });

  it("clamps scores to a safe 0-100 range", () => {
    const profile = qualityProfile({ completeness: 140, conversionReadiness: 140, contentReadiness: 140, missingMobileCta: false, missingTrust: false, missingFaq: false, missingHomeHero: false });
    expect(profile.overall).toBeLessThanOrEqual(100);
    expect(profile.overall).toBeGreaterThanOrEqual(0);
  });
  it("surfaces structural gaps even when headline readiness scores look healthy", () => {
    const profile = qualityProfile({
      completeness: 95,
      conversionReadiness: 92,
      contentReadiness: 92,
      missingMobileCta: false,
      missingTrust: false,
      missingFaq: false,
      missingHomeHero: false,
      emptySections: 2,
      pagesMissingSeo: 3,
      ctaCount: 0,
    });

    expect(profile.priorities).toEqual(expect.arrayContaining(["content", "seo", "conversion"]));
    expect(profile.content).toBeLessThan(85);
    expect(profile.seo).toBeLessThan(85);
  });
  it("reduces design quality when a non-home page lacks a deliberate opening", () => {
    const complete = qualityProfile({ completeness: 95, conversionReadiness: 95, contentReadiness: 95, missingMobileCta: false, missingTrust: false, missingFaq: false, missingHomeHero: false, pagesMissingOpening: 0, totalPages: 4 });
    const incomplete = qualityProfile({ completeness: 95, conversionReadiness: 95, contentReadiness: 95, missingMobileCta: false, missingTrust: false, missingFaq: false, missingHomeHero: false, pagesMissingOpening: 1, totalPages: 4 });
    expect(incomplete.design).toBeLessThan(complete.design);
    expect(incomplete.priorities).toContain("design");
  });

});
