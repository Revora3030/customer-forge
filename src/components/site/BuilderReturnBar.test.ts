import { describe, expect, it } from "vitest";
import { BOTTOM_PINNED_SLACK, KNOWN_BAR_SLACK, pinnedBarHeight, visibleViewportBottom } from "@/components/site/BuilderReturnBar";

const bar = (bottomGap: number, height = 88) => ({ top: 800 - bottomGap - height, bottom: 800 - bottomGap, width: 390, height });

describe("pinnedBarHeight", () => {
  it("measures a bar that touches the bottom of the screen", () => {
    expect(pinnedBarHeight(bar(0), 800)).toBe(88);
  });

  it("still finds a bar a few pixels off the bottom, as on an iPhone with its address bar showing", () => {
    expect(pinnedBarHeight(bar(10), 800)).toBe(98);
    expect(pinnedBarHeight(bar(-12), 800)).toBe(76);
    expect(pinnedBarHeight(bar(BOTTOM_PINNED_SLACK), 800)).toBeGreaterThan(0);
  });

  it("finds an iPhone sticky bar against the visual viewport when the layout viewport is taller", () => {
    const sticky = { top: 620, bottom: 708, width: 390, height: 88 };
    const visible = visibleViewportBottom(800, { offsetTop: 0, height: 708 });
    expect(visible).toBe(708);
    expect(pinnedBarHeight(sticky, 800)).toBe(0);
    expect(pinnedBarHeight(sticky, visible)).toBe(88);
    expect(pinnedBarHeight(sticky, 800, KNOWN_BAR_SLACK)).toBeGreaterThan(0);
  });

  it("ignores a bar floating well above the bottom, one taller than half the screen, and empty boxes", () => {
    expect(pinnedBarHeight(bar(BOTTOM_PINNED_SLACK + 20), 800)).toBe(0);
    expect(pinnedBarHeight(bar(0, 500), 800)).toBe(0);
    expect(pinnedBarHeight({ top: 0, bottom: 0, width: 0, height: 0 }, 800)).toBe(0);
  });
});
