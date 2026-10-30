import { describe, expect, it } from "vitest";
import { settleStageSize } from "@/lib/builder/stage-size";

describe("preview stage size", () => {
  it("takes the first real measurement", () => {
    expect(settleStageSize({ width: 0, height: 0 }, { width: 801.4, height: 702.6 })).toEqual({ width: 801, height: 703 });
  });

  it("ignores sub-pixel and few-pixel jitter so the frame stops resizing", () => {
    const prev = { width: 800, height: 700 };
    expect(settleStageSize(prev, { width: 800.6, height: 699.2 })).toBe(prev);
    expect(settleStageSize(prev, { width: 802, height: 701 })).toBe(prev);
  });

  it("follows a real resize", () => {
    expect(settleStageSize({ width: 800, height: 700 }, { width: 640, height: 700 })).toEqual({ width: 640, height: 700 });
  });

  it("converges: repeated identical readings never change state", () => {
    let size = { width: 0, height: 0 };
    for (let i = 0; i < 10; i += 1) size = settleStageSize(size, { width: 1000 + (i % 2), height: 680 - (i % 2) });
    const settled = size;
    expect(settleStageSize(settled, { width: 1001, height: 679 })).toBe(settled);
  });
});
