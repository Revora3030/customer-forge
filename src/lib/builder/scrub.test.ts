import { describe, expect, it } from "vitest";
import { scrubProgress, scrubTime, shouldSeek } from "./scrub";

describe("scroll-scrubbed video maths", () => {
  it("runs 0 → 1 across the pinned travel and clamps outside it", () => {
    expect(scrubProgress(0, 2700, 900)).toBe(0);
    expect(scrubProgress(-900, 2700, 900)).toBe(0.5);
    expect(scrubProgress(-1800, 2700, 900)).toBe(1);
    expect(scrubProgress(300, 2700, 900)).toBe(0);
    expect(scrubProgress(-5000, 2700, 900)).toBe(1);
  });

  it("has no travel when the track is not taller than the screen", () => {
    expect(scrubProgress(-100, 800, 900)).toBe(0);
  });

  it("maps progress to a playhead that never runs off the end", () => {
    expect(scrubTime(0, 10)).toBe(0);
    expect(scrubTime(1, 10)).toBeCloseTo(9.95);
    expect(scrubTime(0.5, 10)).toBeCloseTo(4.975);
    expect(scrubTime(0.5, Number.NaN)).toBe(0);
    expect(scrubTime(0.5, 0)).toBe(0);
  });

  it("skips seeks that would not change the picture", () => {
    expect(shouldSeek(1, 1.01)).toBe(false);
    expect(shouldSeek(1, 1.05)).toBe(true);
  });
});
