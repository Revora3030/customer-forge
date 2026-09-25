import { describe, expect, it } from "vitest";
import { assessLaunchQuality } from "./launch-quality-gate";
import { launchQualityInputFromSnapshot, notApplicableFromSnapshot } from "./launch-quality-signals";
import { currentPassingVisualScore } from "./launch-review.functions";

const full = {
  conversion: 100, messaging: 100, content: 100, mobile: 100,
  accessibility: 100, seo: 100, trust: 0, performance: 100, publishing: 100,
};

describe("launch score evidence", () => {
  it("a truthful site with no reviews can reach 95", () => {
    expect(assessLaunchQuality(full).score).toBeLessThan(95);
    expect(assessLaunchQuality(full, { notApplicable: ["trust"] }).score).toBeGreaterThanOrEqual(95);
  });

  it("trust only skipped when there is no review or credential evidence", () => {
    const base = { reviewCount: 0, credentialCount: 0 } as Parameters<typeof notApplicableFromSnapshot>[0];
    expect(notApplicableFromSnapshot(base)).toEqual(["trust"]);
    expect(notApplicableFromSnapshot({ ...base, reviewCount: 1 })).toEqual([]);
  });

  it("browser visual evidence remains a separate publish gate", () => {
    const rows = [
      { report: { passed: false, score: 71 }, revision_hash: "cur" },
      { report: { passed: true, score: 91 }, revision_hash: "cur" },
    ];
    expect(currentPassingVisualScore(rows, "cur")).toBeNull(); // newest failed
    expect(currentPassingVisualScore([{ report: { passed: true, score: 91 }, revision_hash: "old" }], "cur")).toBeNull();
    expect(currentPassingVisualScore([{ report: { passed: true, score: 91 }, revision_hash: "cur" }], "cur")).toBe(91);
    expect(currentPassingVisualScore(rows, null)).toBeNull();
    const snap = { visualCheckScore: null } as unknown as Parameters<typeof launchQualityInputFromSnapshot>[0];
    expect("visual_design" in launchQualityInputFromSnapshot(snap)).toBe(false);
  });
});
