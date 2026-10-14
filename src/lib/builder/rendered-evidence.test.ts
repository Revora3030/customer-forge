import { describe, expect, it } from "vitest";
import { inspectRenderedEvidence } from "./rendered-evidence.mjs";
import { freshSiteVisualReport, freshVisualReport, auditWorkspaceWebsite } from "./quality.server";
import { VIEWPORTS, type ViewportMeasurement } from "./visual";

function clean(width: number): ViewportMeasurement {
  return {
    width, scrollWidth: width, overflowing: [], brokenImages: [], clipped: [],
    smallTargets: [], tinyText: [], unreachable: [], navigable: true, ctas: 1,
    accessibility: {
      imagesMissingAlt: [], unlabeledControls: [], unlabeledInputs: [],
      headingOrderProblems: [], h1Count: 1, hasMain: true, hasNav: true,
      controls: 1, keyboardReachable: 1, lowContrast: [], zoomBlocked: false,
    },
    performance: {
      ttfb: 100, fcp: 200, lcp: 300, cls: 0, inp: null, longTasks: 0,
      resources: 1, scriptBytes: 100, imageBytes: 100, fontBytes: 100,
      failedRequests: 0, oversizedImages: [], renderBlocking: 0,
    },
  };
}

const row = (measurements: unknown, page = "home") => ({
  page_slug: page, measured_at: "2026-09-06T00:00:00Z", measurements,
});

describe("per-page rendered evidence", () => {
  it("accepts complete evidence at every required width", () => {
    const result = inspectRenderedEvidence(VIEWPORTS.map(clean), VIEWPORTS);
    expect(result.invalidMeasurements).toBe(0);
    expect(result.missingWidths).toEqual([]);
    expect(result.missingAccessibilityWidths).toEqual([]);
    expect(result.missingPerformanceWidths).toEqual([]);
    expect(freshVisualReport(row(VIEWPORTS.map(clean)), [])?.passed).toBe(true);
  });

  it("does not combine different pages to fake complete viewport coverage", () => {
    const result = freshSiteVisualReport([
      row(VIEWPORTS.slice(0, 4).map(clean)),
      row(VIEWPORTS.slice(4).map(clean), "contact"),
    ], ["home", "contact"], []);
    expect(result.passed).toBe(false);
    expect(result.findings.some((finding) => finding.key === "page_widths_not_measured")).toBe(true);
  });

  it("requires the homepage even when its stored slug is empty", () => {
    const report = freshSiteVisualReport([
      row(VIEWPORTS.map(clean), "contact"),
    ], ["", "contact"], []);
    expect(report.passed).toBe(false);
    expect(report.findings.some((finding) => finding.page === "home")).toBe(true);
  });

  it("normalizes a measured empty homepage slug consistently", () => {
    const report = freshSiteVisualReport([
      row(VIEWPORTS.map(clean), ""),
    ], [""], []);
    expect(report.passed).toBe(true);
    expect(report.pages).toEqual(["home"]);
  });

  it("does not let duplicate widths replace missing measurements", () => {
    const result = inspectRenderedEvidence(VIEWPORTS.map(() => clean(320)), VIEWPORTS);
    expect(result.missingWidths).toEqual(VIEWPORTS.filter((width) => width !== 320));
  });

  it("requires accessibility evidence at every width", () => {
    const measurements = VIEWPORTS.map(clean);
    delete measurements[1]!.accessibility;
    const report = freshVisualReport(row(measurements), []);
    expect(report?.passed).toBe(false);
    expect(report?.coverage?.accessibility).toBe(false);
  });

  it("requires performance evidence at every width", () => {
    const measurements = VIEWPORTS.map(clean);
    delete measurements[1]!.performance;
    const report = freshVisualReport(row(measurements), []);
    expect(report?.passed).toBe(false);
    expect(report?.coverage?.performance).toBe(false);
  });

  it.each([null, undefined, "fixture", {}, { width: 320 }])(
    "does not turn malformed records into measured evidence",
    (value) => {
      expect(freshVisualReport(row([value]), [])).toBeNull();
    },
  );

  it("blocks mixed valid and malformed records", () => {
    const report = freshVisualReport(row([...VIEWPORTS.map(clean), null]), []);
    expect(report?.passed).toBe(false);
    expect(report?.findings.some((finding) => finding.key === "malformed_visual_evidence")).toBe(true);
  });

  it("rejects empty accessibility and performance objects", () => {
    const measurements = VIEWPORTS.map((width) => ({ ...clean(width), accessibility: {}, performance: {} }));
    const evidence = inspectRenderedEvidence(measurements, VIEWPORTS);
    expect(evidence.missingAccessibilityWidths).toEqual(VIEWPORTS);
    expect(evidence.missingPerformanceWidths).toEqual(VIEWPORTS);
  });

  it("rejects negative or non-finite performance values", () => {
    const measurements = VIEWPORTS.map(clean);
    measurements[0]!.performance!.lcp = -1;
    measurements[1]!.performance!.cls = Number.NaN;
    const evidence = inspectRenderedEvidence(measurements, VIEWPORTS);
    expect(evidence.missingPerformanceWidths).toEqual([320, 375]);
  });

  it("preserves stale-report rejection", () => {
    expect(freshVisualReport(row(VIEWPORTS.map(clean)), ["2026-09-07T00:00:00Z"])).toBeNull();
  });

  it("fails closed when a required database read returns an error", async () => {
    class Query {
      select() { return this; }
      eq() { return this; }
      order() { return this; }
      maybeSingle() { return Promise.resolve({ data: null, error: { message: "fixture" } }); }
      limit() { return Promise.resolve({ data: [], error: null }); }
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve({ data: [], error: null }).then(resolve);
      }
    }
    const db = { from: () => new Query() };
    await expect(auditWorkspaceWebsite(db as never, "fixture-org")).rejects.toThrow(
      "required database read failed",
    );
  });
});
