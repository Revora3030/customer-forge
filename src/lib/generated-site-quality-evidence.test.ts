import { expect, test } from "vitest";
import {
  assessGeneratedSiteQuality,
  evidenceFromGeneratedSiteSignals,
} from "./generated-site-quality-evidence";

const completeSignals = {
  brandProfileResolved: true,
  heroHasSpecificOfferAndCta: true,
  primaryConversionRouteWorks: true,
  verifiedFactsAndTrustProof: true,
  specificNonPlaceholderContent: true,
  consistentTokensAndComposition: true,
  responsiveChecksPass: true,
  accessibilityChecksPass: true,
  performanceChecksPass: true,
  assetAndFactProvenanceComplete: true,
};

test("maps module signals to publishable quality evidence", () => {
  expect(evidenceFromGeneratedSiteSignals(completeSignals).conversionPath).toBe(true);
  expect(assessGeneratedSiteQuality(completeSignals).result.publishable).toBe(true);
});

test("preserves explicit blocks and produces a corrective recommendation", () => {
  const assessment = assessGeneratedSiteQuality({
    ...completeSignals,
    blockedReasons: ["Unsupported certification badge"],
  });
  expect(assessment.result.publishable).toBe(false);
  expect(assessment.recommendations[0]?.action).toBe("Unsupported certification badge");
});
