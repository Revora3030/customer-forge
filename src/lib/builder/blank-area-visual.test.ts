import { describe, expect, it } from "vitest";
import { gradeViewport } from "./visual";

const base = { width: 390, scrollWidth: 390, overflowing: [], brokenImages: [], clipped: [], smallTargets: [], tinyText: [], unreachable: [], navigable: true, ctas: 1 };
const keys = (m: object) => gradeViewport(m as never).map((f: { key: string }) => f.key);

describe("measured blank areas and opening visual", () => {
  it("fails a blank stretch taller than half the screen", () => {
    expect(keys({ ...base, largestBlankGap: 500, viewportHeight: 844 })).toContain("large_blank_area");
  });
  it("passes a blank stretch under half the screen", () => {
    expect(keys({ ...base, largestBlankGap: 400, viewportHeight: 844 })).not.toContain("large_blank_area");
  });
  it("fails a first screen with no photo", () => {
    expect(keys({ ...base, openingVisualMissing: true })).toContain("missing_opening_visual");
  });
  it("says nothing when the page was not measured", () => {
    expect(keys(base)).not.toContain("missing_opening_visual");
  });
});
