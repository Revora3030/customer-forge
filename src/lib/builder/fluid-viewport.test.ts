import { describe, expect, it } from "vitest";
import {
  clampFluidWidth,
  fluidBadges,
  overflowBadge,
  readingMatchesWidth,
  summarizeTapTargets,
  tapTargetBadge,
  FLUID_MAX_WIDTH,
  FLUID_MIN_WIDTH,
} from "./fluid-viewport";

describe("fluid viewport width", () => {
  it("keeps the slider between 320 and 1440 whole pixels", () => {
    expect(FLUID_MIN_WIDTH).toBe(320);
    expect(FLUID_MAX_WIDTH).toBe(1440);
    expect(clampFluidWidth(100)).toBe(320);
    expect(clampFluidWidth(2560)).toBe(1440);
    expect(clampFluidWidth(777.6)).toBe(778);
    expect(clampFluidWidth(Number.NaN)).toBe(390);
  });

  it("only accepts a reading taken at the width on screen", () => {
    expect(readingMatchesWidth(390, 390)).toBe(true);
    expect(readingMatchesWidth(375, 390)).toBe(true); // scrollbar-narrower frame
    expect(readingMatchesWidth(1280, 390)).toBe(false);
    expect(readingMatchesWidth(0, 390)).toBe(false);
  });
});

describe("fluid badges never invent a measurement", () => {
  it("says NOT MEASURED when nothing was reported", () => {
    const [overflow, taps] = fluidBadges({ viewportWidth: 390, overflow: null, taps: null });
    expect(overflow?.state).toBe("not_verified");
    expect(overflow?.text).toContain("NOT MEASURED");
    expect(taps?.state).toBe("not_verified");
    expect(taps?.text).toContain("NOT MEASURED");
    expect(`${overflow?.text}${taps?.text}`).not.toMatch(/\d+ tap target/);
  });

  it("treats a reading from another width as NOT MEASURED", () => {
    const stale = { overflow: false, clientWidth: 1280, scrollWidth: 1280, culprits: [] };
    expect(overflowBadge(stale, 390).state).toBe("not_verified");
    const staleTaps = { checked: 12, smallCount: 0, smallest: null, clientWidth: 1280, examples: [] };
    expect(tapTargetBadge(staleTaps, 390).state).toBe("not_verified");
  });

  it("reports a measured overflow with the elements that stick out", () => {
    const badge = overflowBadge({ overflow: true, clientWidth: 320, scrollWidth: 412, culprits: ['hero: "Book now"'] }, 320);
    expect(badge.state).toBe("fail");
    expect(badge.text).toBe("Horizontal scroll detected at 320px");
    expect(badge.detail).toContain("412px");
    expect(badge.detail).toContain("Book now");
  });

  it("reports a measured pass only from a matching reading", () => {
    const badge = overflowBadge({ overflow: false, clientWidth: 768, scrollWidth: 768, culprits: [] }, 768);
    expect(badge.state).toBe("pass");
    expect(badge.text).toBe("No sideways scroll at 768px");
  });

  it("counts tap targets under 44px from the frame's own report", () => {
    const badge = tapTargetBadge({ checked: 20, smallCount: 3, smallest: 28, clientWidth: 390, examples: ["button: Menu"] }, 390);
    expect(badge.state).toBe("fail");
    expect(badge.text).toBe("3 tap targets under 44px");
    expect(badge.detail).toContain("smallest 28px");
    expect(tapTargetBadge({ checked: 20, smallCount: 1, smallest: 30, clientWidth: 390, examples: [] }, 390).text).toBe("1 tap target under 44px");
  });

  it("passes only when controls were measured and all are large enough", () => {
    expect(tapTargetBadge({ checked: 9, smallCount: 0, smallest: null, clientWidth: 390, examples: [] }, 390).state).toBe("pass");
  });
});

describe("summarizeTapTargets", () => {
  it("ignores hidden controls and finds the smallest edge", () => {
    const report = summarizeTapTargets(
      [
        { width: 0, height: 0, label: "hidden" },
        { width: 120, height: 48, label: "ok" },
        { width: 44, height: 44, label: "exactly 44" },
        { width: 30, height: 60, label: "narrow" },
        { width: 90, height: 20, label: "short" },
      ],
      389.6,
    );
    expect(report).toEqual({ checked: 4, smallCount: 2, smallest: 20, clientWidth: 390, examples: ["narrow", "short"] });
  });

  it("reports an empty page as zero checked, not as a pass of anything", () => {
    expect(summarizeTapTargets([], 390)).toEqual({ checked: 0, smallCount: 0, smallest: null, clientWidth: 390, examples: [] });
  });
});
