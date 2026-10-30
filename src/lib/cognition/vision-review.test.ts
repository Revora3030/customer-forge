import { describe, expect, it } from "vitest";
import { REVIEW_VIEWPORTS, mergeReview, parseVisionCritique, type Measurement } from "./vision-review";

const measured = (viewport: (typeof REVIEW_VIEWPORTS)[number], findings: Measurement["findings"] = []): Measurement => ({ viewport, measured: true, findings });
const all = REVIEW_VIEWPORTS.map((v) => measured(v));

describe("vision review", () => {
  it("passes only when every viewport is measured and nothing blocks, carrying the critique score", () => {
    expect(mergeReview(all, parseVisionCritique({ score: 9.04, issues: [] }))).toMatchObject({ status: "passed", score: 9, notMeasured: [] });
  });

  it("a glowing vision score cannot erase a measured P0", () => {
    const withP0 = [measured(320, [{ viewport: 320, check: "overflow", severity: "P0", detail: "sideways scroll" }]), ...all.slice(1)];
    const verdict = mergeReview(withP0, { score: 10, issues: [] });
    expect(verdict.status).toBe("failed");
    expect(verdict.score).toBeNull();
    expect(verdict.blocking).toHaveLength(1);
  });

  it("an unmeasured viewport is incomplete, never a pass", () => {
    const verdict = mergeReview(all.slice(0, 3), { score: 10, issues: [] });
    expect(verdict.status).toBe("incomplete");
    expect(verdict.notMeasured).toEqual([1280, 2560]);
    expect(verdict.score).toBeNull();
    expect(mergeReview([], null).status).toBe("incomplete");
  });

  it("keeps vision issues advisory", () => {
    const verdict = mergeReview(all, { score: 7, issues: [{ viewport: 390, severity: "P0", note: "hero looks cramped" }] });
    expect(verdict.status).toBe("passed");
    expect(verdict.advisory).toHaveLength(1);
  });

  it("rejects malformed model output", () => {
    expect(parseVisionCritique({ score: 11, issues: [] })).toBeNull();
    expect(parseVisionCritique({ score: 5, issues: [{ viewport: 500, severity: "P1", note: "x" }] })).toBeNull();
    expect(parseVisionCritique({ score: 5, issues: [{ viewport: 390, severity: "P9", note: "x" }] })).toBeNull();
    expect(parseVisionCritique({ score: 5, issues: [{ viewport: 390, severity: "P1", note: " " }] })).toBeNull();
    expect(parseVisionCritique("nope")).toBeNull();
    expect(parseVisionCritique({ score: 8.26, issues: [{ viewport: 390, severity: "P2", note: " tight " }] })).toEqual({ score: 8.3, issues: [{ viewport: 390, severity: "P2", note: "tight" }] });
  });
});
