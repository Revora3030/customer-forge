import { describe, expect, it } from "vitest";
import { intelligenceProfile } from "./intelligence-profile";

describe("intelligence profile", () => {
  it("auto-executes broad high-confidence growth requests", () => {
    const profile = intelligenceProfile({
      instruction: "make my website better and get me more bookings",
      pages: 5,
      sections: 20,
      completeness: 72,
      conversionReadiness: 65,
      contentReadiness: 80,
      missingMobileCta: true,
      missingTrust: true,
      missingFaq: true,
      missingHomeHero: false,
    });
    expect(profile.broad).toBe(true);
    expect(profile.autoExecute).toBe(true);
    expect(profile.priorities).toEqual(expect.arrayContaining(["conversion", "mobile", "trust"]));
  });

  it("does not invent priorities from an empty workspace", () => {
    const profile = intelligenceProfile({
      instruction: "make it better",
      pages: 0,
      sections: 0,
      completeness: 0,
      conversionReadiness: 0,
      contentReadiness: 0,
      missingMobileCta: false,
      missingTrust: false,
      missingFaq: false,
      missingHomeHero: false,
    });
    expect(profile.reasons.some((reason) => reason.includes("No pages"))).toBe(true);
  });
});
