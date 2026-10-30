import { describe, expect, it } from "vitest";
import { gradeViewport, gradeVisual, visualTraits, type ViewportMeasurement } from "./visual";

const base = (width: number, extra: Partial<ViewportMeasurement> = {}): ViewportMeasurement => ({
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
  ...extra,
});

describe("QA gate (item 10)", () => {
  it("does not score checks that never ran", () => {
    const traits = visualTraits([], { accessibility: false, performance: false }, true);
    expect(traits.find((t) => t.name === "accessibility")).toEqual({ name: "accessibility", executed: false, score: null });
    expect(traits.find((t) => t.name === "performance")?.executed).toBe(false);
  });

  it("is not ready when accessibility was never measured, even with no findings", () => {
    const report = gradeVisual([base(390), base(768), base(1280)]);
    expect(report.passed).toBe(true);
    expect(report.ready).toBe(false);
  });

  it("empty FAQ answers and low contrast are P0", () => {
    const faq = gradeViewport(base(390, { emptyFaqAnswers: ["Do you offer warranties?"] }));
    expect(faq.find((f) => f.key === "empty_faq_answer")?.severity).toBe("p0");
    const contrast = gradeViewport(
      base(390, {
        accessibility: { lowContrast: [{ selector: "p.lead", ratio: 2.1 }] } as unknown as ViewportMeasurement["accessibility"],
      }),
    );
    expect(contrast.find((f) => f.key === "low_contrast")?.severity).toBe("p0");
  });

  it("phone-width sticky bar covering a control is P0", () => {
    const findings = gradeViewport(base(390, { overlayConflicts: ["sticky bar over Submit"] }));
    expect(findings.find((f) => f.key === "overlay_covers_control")?.severity).toBe("p0");
  });

  it("a trait below 6/10 blocks ready", () => {
    const advice = Array.from({ length: 9 }, (_, i) => ({ key: `narrow_column`, severity: "advice" as const, detail: "", fix: "", width: 390, page: `p${i}` }));
    const traits = visualTraits(advice, { accessibility: true, performance: true }, true);
    expect(traits.find((t) => t.name === "layout")!.score!).toBeLessThan(6);
  });
});
