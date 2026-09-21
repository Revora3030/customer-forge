import { describe, expect, it } from "vitest";
import {
  gradeViewport,
  gradeSite,
  gradeVisual,
  VIEWPORTS,
  type ViewportMeasurement,
  type VisualReport,
} from "./visual";
import { auditWebsite, type QualityInput } from "./quality";
import { freshVisualReport } from "./quality.server";
import { businessFacts } from "./facts";

const clean = (width: number): ViewportMeasurement => ({
  width,
  scrollWidth: width,
  overflowing: [],
  brokenImages: [],
  clipped: [],
  smallTargets: [],
  tinyText: [],
  unreachable: [],
  navigable: true,
  ctas: 2,
  accessibility: {
    imagesMissingAlt: [],
    unlabeledControls: [],
    unlabeledInputs: [],
    headingOrderProblems: [],
    h1Count: 1,
    hasMain: true,
    hasNav: true,
    controls: 6,
    keyboardReachable: 6,
    lowContrast: [],
    zoomBlocked: false,
  },
  performance: {
    ttfb: 120,
    fcp: 900,
    lcp: 1600,
    cls: 0.01,
    inp: null,
    longTasks: 0,
    resources: 20,
    scriptBytes: 200_000,
    imageBytes: 400_000,
    fontBytes: 40_000,
    failedRequests: 0,
    oversizedImages: [],
    renderBlocking: 0,
  },
});

describe("rendered visual quality", () => {
  it("checks every phone and desktop width", () => {
    expect(VIEWPORTS).toContain(320);
    expect(VIEWPORTS).toEqual([320, 375, 390, 414, 768, 1024, 1280, 1440]);
  });

  it("passes a page that fits its screen", () => {
    const report = gradeVisual(VIEWPORTS.map((width) => clean(width)));
    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
  });

  it("fails sideways scrolling outright", () => {
    const findings = gradeViewport({ ...clean(390), scrollWidth: 460 });
    expect(findings.some((f) => f.key === "horizontal_overflow" && f.severity === "p0")).toBe(true);
  });

  it("fails broken pictures, clipped words, a dead menu and no button", () => {
    const findings = gradeViewport({
      ...clean(360),
      brokenImages: ["/missing.jpg"],
      clipped: ["Book your detail today"],
      navigable: false,
      ctas: 0,
    });
    const keys = findings.filter((f) => f.severity === "p0").map((f) => f.key);
    expect(keys).toContain("broken_image");
    expect(keys).toContain("clipped_text");
    expect(keys).toContain("menu_unusable");
    expect(keys).toContain("no_visible_cta");
  });

  it("treats small taps and tiny text as advice, not a blocker", () => {
    const findings = gradeViewport({
      ...clean(375),
      smallTargets: [{ selector: "a.link", width: 30, height: 20 }],
      tinyText: [{ selector: "p.note", fontSize: 11 }],
    });
    expect(findings.every((f) => f.severity === "advice")).toBe(true);
  });

  it("never calls an unmeasured site checked", () => {
    const report = gradeVisual([]);
    expect(report.passed).toBe(false);
    expect(report.findings[0]?.key).toBe("not_measured");
  });
});

const goodInput = (visual: VisualReport | null): QualityInput => ({
  facts: businessFacts(
    { phone: "+1 415 555 0132", email: "hello@elitemobilecars.com", city: "Austin" },
    "Elite Mobile Cars",
  ),
  raw: { phone: "+1 415 555 0132", email: "hello@elitemobilecars.com" },
  pages: [
    { slug: "", title: "Home", sections: 5 },
    { slug: "contact", title: "Contact", sections: 2 },
  ],
  texts: ["Mobile detailing that comes to you", "Book a wash in Austin"],
  navLabels: ["Home", "Contact"],
  conversion: { hasPhone: true, hasBooking: true, hasQuote: true, hasContact: true },
  reviewCount: 0,
  galleryCount: 0,
  showsReviews: false,
  showsGallery: false,
  metadata: [
    { title: "Elite Mobile Cars", description: "Mobile detailing in Austin." },
    { title: "Contact Elite Mobile Cars", description: "Book a mobile detail." },
  ],
  visual,
});

describe("what was never measured is never a pass", () => {
  it("keeps a website off production when nobody measured how usable or fast it is", () => {
    const bare = VIEWPORTS.map((width) => {
      const measurement = { ...clean(width) };
      delete measurement.accessibility;
      delete measurement.performance;
      return measurement;
    });
    const report = auditWebsite(goodInput(gradeVisual(bare)));
    expect(report.productionReady).toBe(false);
    // Half credit at most for a category nothing proved.
    expect(report.categories.find((c) => c.name === "accessibility")?.earned).toBeLessThanOrEqual(
      5,
    );
    expect(report.categories.find((c) => c.name === "performance")?.earned).toBeLessThanOrEqual(
      2.5,
    );
  });

  it("fails the whole site when one visible page was never opened", () => {
    const measured = gradeVisual(
      VIEWPORTS.map((width) => clean(width)),
      "home",
    );
    const site = gradeSite(["home", "services"], [{ page: "home", report: measured }]);
    expect(site.passed).toBe(false);
    expect(site.findings.some((f) => f.severity === "p0")).toBe(true);
  });
});

describe("two-layer quality score", () => {
  it("cannot reach 95 or production-ready without a browser check", () => {
    const report = auditWebsite(goodInput(null));
    expect(report.measured).toBe(false);
    expect(report.productionReady).toBe(false);
    expect(report.score).toBeLessThan(95);
  });

  it("reaches 95+ and production-ready only when both layers are clean", () => {
    const visual = gradeVisual(VIEWPORTS.map((width) => clean(width)));
    const report = auditWebsite(goodInput(visual));
    expect(report.measured).toBe(true);
    expect(report.score).toBeGreaterThanOrEqual(95);
    expect(report.productionReady).toBe(true);
  });

  it("loses the responsive score when the rendered check finds overflow", () => {
    const visual = gradeVisual([{ ...clean(390), scrollWidth: 520 }]);
    const report = auditWebsite(goodInput(visual));
    expect(report.productionReady).toBe(false);
    expect(report.categories.find((c) => c.name === "responsive")?.earned).toBe(0);
  });

  it("weights add up to 100", () => {
    const report = auditWebsite(goodInput(null));
    expect(report.categories.reduce((total, c) => total + c.weight, 0)).toBe(100);
  });
});

describe("freshVisualReport", () => {
  const cleanMeasurements = VIEWPORTS.map((width) => clean(width));
  const row = (measuredAt: string) => ({
    measured_at: measuredAt,
    measurements: cleanMeasurements,
  });

  it("re-grades a fresh stored report from its raw measurements", () => {
    const report = freshVisualReport(row("2026-09-06T00:00:00Z"), ["2026-09-05T00:00:00Z"]);
    expect(report?.passed).toBe(true);
    expect(report?.widths.length).toBe(VIEWPORTS.length);
  });

  it("treats a report older than the newest content edit as unmeasured", () => {
    expect(
      freshVisualReport(row("2026-09-05T00:00:00Z"), [
        "2026-09-04T00:00:00Z",
        "2026-09-06T00:00:00Z",
      ]),
    ).toBeNull();
  });

  it("ignores missing or unreadable rows instead of guessing", () => {
    expect(freshVisualReport(null, [])).toBeNull();
    expect(freshVisualReport({ measured_at: "not-a-date", measurements: [] }, [])).toBeNull();
    expect(
      freshVisualReport({ measured_at: "2026-09-06T00:00:00Z", measurements: [] }, []),
    ).toBeNull();
  });
});
