import { describe, expect, it } from "vitest";
import { capScrubFrames, scrubFrame, scrubProgress, scrubTime, scrubTransition, shouldSeek, SCRUB_FRAME_LIMITS } from "./scrub";

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

  it("wipes a still sequence from the first frame to the last", () => {
    expect(scrubFrame(0, 3)).toEqual({ index: 0, mix: 0 });
    expect(scrubFrame(0.25, 3).index).toBe(0);
    expect(scrubFrame(0.25, 3).mix).toBeCloseTo(0.5);
    expect(scrubFrame(1, 3)).toEqual({ index: 2, mix: 0 });
    expect(scrubFrame(0.4, 1)).toEqual({ index: 0, mix: 0 });
  });

  it("skips seeks that would not change the picture", () => {
    expect(shouldSeek(1, 1.01)).toBe(false);
    expect(shouldSeek(1, 1.05)).toBe(true);
  });
});

describe("scrub frame cap", () => {
  const frames = (real: number, generated = 0) => [
    ...Array.from({ length: real }, (_, i) => ({ id: `r${i}`, generated: false })),
    ...Array.from({ length: generated }, (_, i) => ({ id: `g${i}`, generated: true })),
  ];

  it("leaves a sequence of up to six frames alone, generated atmosphere included", () => {
    expect(capScrubFrames(frames(2, 4)).map((f) => f.id)).toEqual(["r0", "r1", "g0", "g1", "g2", "g3"]);
  });

  it("keeps only real photographs beyond six frames, capped at 18", () => {
    expect(capScrubFrames(frames(8, 3)).every((f) => !f.generated)).toBe(true);
    expect(capScrubFrames(frames(8, 3))).toHaveLength(8);
    expect(capScrubFrames(frames(24))).toHaveLength(SCRUB_FRAME_LIMITS.max);
  });

  it("falls back to the first six authored frames when almost nothing real is left", () => {
    expect(capScrubFrames(frames(1, 9)).map((f) => f.id)).toEqual(["r0", "g0", "g1", "g2", "g3", "g4"]);
  });

  it("wipes short sequences and cross-fades from ten frames", () => {
    expect(scrubTransition(6)).toBe("wipe");
    expect(scrubTransition(9)).toBe("wipe");
    expect(scrubTransition(10)).toBe("crossfade");
    expect(scrubTransition(18)).toBe("crossfade");
  });
});
