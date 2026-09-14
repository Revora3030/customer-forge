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
});
