import { describe, expect, it } from "vitest";
import {
  REQUIRED_REVIEW_WIDTHS,
  reviewLaunchQuality,
  type LaunchReviewFacts,
  type LaunchReviewMeasurement,
} from "./launch-review";

const baseFacts: LaunchReviewFacts = {
  headline: "Mobile detailing for busy Dallas families, at your driveway",
  subheadline: "Book a same-day interior and exterior detail without leaving home.",
  metaDescription:
    "Mobile car detailing in Dallas. Same-day interior and exterior detailing at your home or office, with transparent pricing and no hidden fees.",
  primaryCtaLabel: "Get my quote",
  businessDescription:
    "We detail cars at your home across Dallas with our own water and power, so nothing is needed from you.",
  audience: "dallas",
  city: "Dallas",
  serviceArea: "Dallas metro",
  serviceCount: 4,
  faqCount: 5,
  reviewCount: 4,
  credentialCount: 2,
  imageCount: 5,
  hasProcessSection: true,
  hasHeroImage: true,
  visualDirectionSet: true,
  ctaSectionCount: 3,
  captureSectionPresent: true,
  legalPagesPresent: true,
  analyticsConfigured: true,
  contactRouteVerified: true,
  customDomainConnected: true,
  measurement: null,
};

const cleanMeasurement: LaunchReviewMeasurement = {
  measuredAt: "2026-09-21T00:00:00.000Z",
  widths: [...REQUIRED_REVIEW_WIDTHS],
  seo: {
    title: baseFacts.headline,
    description: baseFacts.metaDescription,
    h1Count: 1,
    imageAltCoverage: 1,
    internalLinks: 6,
    structuredData: true,
  },
  performance: {
    htmlBytes: 90_000,
    jsBytes: 400_000,
    cssBytes: 60_000,
    requestCount: 30,
    largestContentfulPaintMs: 1800,
    cumulativeLayoutShift: 0.02,
    interactionToNextPaintMs: 90,
  },
  smallTargetCount: 0,
  overflowCount: 0,
  headingOrderProblems: 0,
  lowContrastCount: 0,
  unlabeledControlCount: 0,
  zoomBlocked: false,
};

describe("launch review", () => {
  it("never claims mobile, accessibility or speed without browser evidence", () => {
    const review = reviewLaunchQuality(baseFacts);
    expect(review.measuredAt).toBeNull();
    expect(review.snapshot.mobileReviewed).toBe(false);
    expect(review.snapshot.contrastChecked).toBe(false);
    expect(review.snapshot.performanceBudgetPassed).toBe(false);
    expect(review.report.passed).not.toContain("performance");
    expect(review.evidence.find((item) => item.key === "browser_measurement")?.state).toBe(
      "not_measured",
    );
  });

  it("passes measured technical dimensions without inventing a visual rating", () => {
    const review = reviewLaunchQuality({ ...baseFacts, measurement: cleanMeasurement });
    expect(review.measuredAt).toBe(cleanMeasurement.measuredAt);
    expect(review.seo.failures).toEqual([]);
    expect(review.performance.passed).toBe(true);
    expect(review.report.score).toBeGreaterThanOrEqual(80);
    expect(review.report.passed).not.toContain("visual_design");
    expect(review.report.nextAction).toBeNull();
  });

  it("requires all eight widths before mobile counts as reviewed", () => {
    const review = reviewLaunchQuality({
      ...baseFacts,
      measurement: { ...cleanMeasurement, widths: [375, 1280] },
    });
    expect(review.snapshot.mobileReviewed).toBe(false);
    expect(review.evidence.find((item) => item.key === "required_widths")?.state).toBe(
      "not_measured",
    );
  });

  it("reports real performance and accessibility failures instead of a pass", () => {
    const review = reviewLaunchQuality({
      ...baseFacts,
      measurement: {
        ...cleanMeasurement,
        performance: { ...cleanMeasurement.performance, largestContentfulPaintMs: 5200 },
        lowContrastCount: 3,
        smallTargetCount: 2,
      },
    });
    expect(review.performance.passed).toBe(false);
    expect(review.performance.failures).toContain("LCP");
    expect(review.snapshot.contrastChecked).toBe(false);
    expect(review.snapshot.tapTargetsChecked).toBe(false);
    expect(review.report.nextAction).not.toBeNull();
  });

  it("does not credit thin content or a missing conversion path", () => {
    const review = reviewLaunchQuality({
      ...baseFacts,
      serviceCount: 0,
      faqCount: 0,
      hasProcessSection: false,
      ctaSectionCount: 0,
      captureSectionPresent: false,
      primaryCtaLabel: "",
      measurement: cleanMeasurement,
    });
    expect(review.snapshot.hasPrimaryCta).toBe(false);
    expect(review.report.findings.some((finding) => finding.dimension === "conversion")).toBe(true);
    expect(review.report.findings.some((finding) => finding.dimension === "content")).toBe(true);
  });
});

describe("launch blockers from the stored site", () => {
  const pages: LaunchReviewFacts["pages"] = [
    {
      slug: "home",
      sections: [
        { kind: "hero", components: [{ kind: "hero_image", media_url: "org/hero.jpg" }] },
        { kind: "gallery", components: [{ kind: "image", media_url: null }, { kind: "image", media_url: "https://images.example/stock-1.jpg" }] },
      ],
    },
    { slug: "hidden", visible: false, sections: [{ kind: "story", components: [{ kind: "image", media_url: "" }] }] },
  ];
  const mediaSources = [
    { url: "org/hero.jpg", source: "owner" },
    { url: "https://images.example/stock-1.jpg", source: "stock:openverse" },
  ];

  it("blocks an image block with no photo on a visible page, and a stock photo", () => {
    const review = reviewLaunchQuality({ ...baseFacts, measurement: cleanMeasurement, pages, mediaSources });
    expect(review.blockers.map((blocker) => [blocker.code, blocker.page, blocker.blocking])).toEqual([
      ["image_without_photo", "home", true],
      ["stock_credit_missing", "home", true],
    ]);
    expect(review.report.nextAction?.priority).toBe("critical");
    expect(review.report.findings[0]?.title).toMatch(/empty picture/i);
    expect(review.evidence.find((item) => item.key === "media_integrity")?.state).toBe("measured");
  });

  it("ignores hidden pages and reports nothing when the stored site is clean", () => {
    const clean = reviewLaunchQuality({
      ...baseFacts,
      measurement: cleanMeasurement,
      // The home hero only (an owner photo), plus the hidden page with its empty image block.
      pages: [{ slug: "home", sections: [pages![0]!.sections[0]!] }, pages![1]!],
      mediaSources,
    });
    expect(clean.blockers).toEqual([]);
    expect(clean.report.nextAction).toBeNull();
  });

  it("reports the picture check as not measured when no pages were supplied", () => {
    const review = reviewLaunchQuality(baseFacts);
    expect(review.blockers).toEqual([]);
    expect(review.evidence.find((item) => item.key === "media_integrity")?.state).toBe("not_measured");
  });
});
