import { describe, expect, test } from "vitest";
import {
  QUALITY_DIMENSIONS,
  evaluateGeneratedSiteQuality,
  qualityFailureSummary,
} from "./generated-site-quality";

const completeEvidence = Object.fromEntries(
  QUALITY_DIMENSIONS.map((dimension) => [dimension, true]),
);

describe("evaluateGeneratedSiteQuality", () => {
  test("permits a complete, unblocked site", () => {
    const result = evaluateGeneratedSiteQuality({ evidence: completeEvidence });
    expect(result.publishable).toBe(true);
    expect(result.score).toBe(5);
    expect(result.failedDimensions).toEqual([]);
  });

  test("blocks a site that is missing quality evidence", () => {
    const result = evaluateGeneratedSiteQuality({
      evidence: { ...completeEvidence, accessibility: false },
    });
    expect(result.publishable).toBe(false);
    expect(result.failedDimensions).toEqual(["accessibility"]);
    expect(qualityFailureSummary(result)).toContain("Missing quality evidence: accessibility");
  });

  test("blocks a fact-safety failure even when every dimension passes", () => {
    const result = evaluateGeneratedSiteQuality({
      evidence: completeEvidence,
      blockedReasons: ["Unverified testimonial attribution"],
    });
    expect(result.publishable).toBe(false);
    expect(qualityFailureSummary(result)).toContain("Unverified testimonial attribution");
  });
});
