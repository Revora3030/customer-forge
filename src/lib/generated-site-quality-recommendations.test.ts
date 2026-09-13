import { expect, test } from "vitest";
import {
  evaluateGeneratedSiteQuality,
  recommendGeneratedSiteQualityImprovements,
} from "./generated-site-quality";

test("prioritizes blocked claims and conversion failures", () => {
  const result = evaluateGeneratedSiteQuality({
    evidence: { conversionPath: false, visualCraft: false },
    blockedReasons: ["Unverified testimonial attribution"],
  });
  const recommendations = recommendGeneratedSiteQualityImprovements(result);
  expect(recommendations[0]).toEqual({
    dimension: "blocked",
    priority: "critical",
    action: "Unverified testimonial attribution",
  });
  expect(recommendations).toContainEqual({
    dimension: "conversionPath",
    priority: "critical",
    action:
      "Add and verify one relevant primary conversion route: contact, quote, booking, purchase, or visit.",
  });
  expect(recommendations).toContainEqual({
    dimension: "visualCraft",
    priority: "medium",
    action:
      "Apply the resolved tokens and vary section composition, imagery, and proof patterns without template repetition.",
  });
});
