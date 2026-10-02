import { describe, expect, it } from "vitest";
import { checkFirstBuildSafety } from "@/lib/builder/first-build-safety";
import type { SiteCopy } from "@/lib/site-engine";

const baseCopy = {
  heroHeadline: "Trusted local service",
  heroSubheadline: "Real information only.",
  primaryCta: "Get a quote",
  secondaryCta: "Contact",
  intro: "We help customers.",
  benefits: ["Professional service."],
  serviceCards: [{ name: "Service", copy: "A service." }],
  faqs: [{ question: "How?", answer: "Contact us." }],
  areaCopy: "Serving our service area.",
  about: "About the business.",
  metaTitle: "Example Business",
  metaDescription: "Example business description for search.",
  ogTitle: "Example Business",
  ogDescription: "Example business description.",
} satisfies SiteCopy;

describe("first-build safety gate", () => {
  it("blocks unsupported credentials and awards", () => {
    const problems = checkFirstBuildSafety({
      facts: { businessName: "Example", services: ["Service"] },
      copy: {
        ...baseCopy,
        heroHeadline: "Award-winning certified service",
      },
    });
    expect(problems.some((problem) => problem.code.includes("unsupported"))).toBe(true);
  });

  it("allows supplied certifications and awards", () => {
    const problems = checkFirstBuildSafety({
      facts: {
        businessName: "Example",
        services: ["Service"],
        certifications: "State Electric License #1234",
        awards: "Local Business Award 2025",
      },
      copy: {
        ...baseCopy,
        heroHeadline: "Award-winning certified service",
      },
    });
    expect(problems.filter((problem) => problem.code.includes("unsupported"))).toHaveLength(0);
  });
});
