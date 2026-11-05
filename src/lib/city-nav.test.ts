import { describe, expect, it } from "vitest";
import { CITY_DISTRICTS } from "./ai-city";
import { FRAMED_VIEW, MAP_MAX_ZOOM, MAP_MIN_ZOOM, SHEET_DISMISS_PX, SHEET_HEIGHT_DVH, centerOn, clampView, miniMapDots, panBy, pinchZoom, sheetDragResult, sheetOffset, viewBoxOf, zoomAbout } from "./city-nav";

describe("miniMapDots (JC-15)", () => {
  it("has one dot for each of the 7 districts, inside the frame, in the city's arrangement", () => {
    const dots = miniMapDots();
    expect(dots.map((d) => d.id)).toEqual(CITY_DISTRICTS.map((d) => d.id));
    expect(dots).toHaveLength(7);
    for (const d of dots) { expect(d.left).toBeGreaterThan(0); expect(d.left).toBeLessThan(100); expect(d.top).toBeGreaterThan(0); expect(d.top).toBeLessThan(100); }
    const by = Object.fromEntries(dots.map((d) => [d.id, d]));
    expect(by["executive"]).toMatchObject({ left: 50, top: 50 });
    expect(by["factory"]!.left).toBeLessThan(by["executive"]!.left);
    expect(by["growth"]!.left).toBeGreaterThan(by["executive"]!.left);
    expect(by["institute"]!.top).toBeLessThan(by["executive"]!.top);
    expect(by["security"]!.top).toBeGreaterThan(by["executive"]!.top);
  });
  it("never puts two districts on the same spot", () => {
    const keys = new Set(miniMapDots().map((d) => `${d.left}:${d.top}`));
    expect(keys.size).toBe(7);
  });
});

describe("flat map camera (JC-60)", () => {
  it("starts framed: the whole 0-100 city is in view, with room for the edge labels", () => {
    expect(viewBoxOf(FRAMED_VIEW)).toBe("-8 -8 116 116");
  });
  it("pinch zoom is limited to the allowed range", () => {
    expect(pinchZoom(1, 100, 200)).toBe(2);
    expect(pinchZoom(1, 100, 900)).toBe(MAP_MAX_ZOOM);
    expect(pinchZoom(2, 100, 10)).toBe(MAP_MIN_ZOOM);
    expect(pinchZoom(2, 0, 50)).toBe(2);
    expect(pinchZoom(2, 50, Number.NaN)).toBe(2);
  });
  it("zooming about a point keeps that point under the fingers", () => {
    const anchor = { x: 80, y: 20 };
    const next = zoomAbout(FRAMED_VIEW, 2, anchor);
    const size = 116 / next.zoom;
    // Fraction of the window the anchor sits at is unchanged.
    expect((anchor.x - (next.cx - size / 2)) / size).toBeCloseTo((80 + 8) / 116, 5);
    expect((anchor.y - (next.cy - size / 2)) / size).toBeCloseTo((20 + 8) / 116, 5);
  });
  it("the window can never leave the map, so the city cannot be dragged off screen", () => {
    const zoomed = zoomAbout(FRAMED_VIEW, 2, { x: 50, y: 50 });
    const far = panBy(zoomed, -500, 500);
    expect(far.cx).toBe(79);
    expect(far.cy).toBe(21);
    expect(viewBoxOf(far)).toBe("50 -8 58 58");
    expect(clampView({ zoom: 99, cx: -4, cy: Number.NaN })).toEqual({ zoom: MAP_MAX_ZOOM, cx: 116 / 6 - 8, cy: 50 });
  });
  it("one-finger pan at full frame stays put", () => {
    expect(panBy(FRAMED_VIEW, 30, 30)).toEqual(FRAMED_VIEW);
  });
  it("flying to a district centres it when zoomed in and clamps at the edges", () => {
    const zoomed = { zoom: 2, cx: 50, cy: 50 };
    expect(centerOn(zoomed, { x: 60, y: 40 })).toMatchObject({ cx: 60, cy: 40 });
    expect(centerOn(zoomed, { x: 99, y: 1 })).toMatchObject({ cx: 79, cy: 21 });
  });
});

describe("bottom sheet drag (JC-60)", () => {
  it("is 80% high by default", () => { expect(SHEET_HEIGHT_DVH).toBe(80); });
  it("closes on a long drag down", () => { expect(sheetDragResult(SHEET_DISMISS_PX, 800, false)).toBe("dismiss"); expect(sheetDragResult(SHEET_DISMISS_PX, 800, true)).toBe("dismiss"); });
  it("closes on a quick flick down, but not on a tiny slow nudge", () => {
    expect(sheetDragResult(40, 50, false)).toBe("dismiss");
    expect(sheetDragResult(40, 900, false)).toBe("settle");
    expect(sheetDragResult(10, 5, false)).toBe("settle");
  });
  it("grows on a drag up, unless already tall", () => {
    expect(sheetDragResult(-60, 300, false)).toBe("grow");
    expect(sheetDragResult(-60, 300, true)).toBe("settle");
  });
  it("only follows the finger downwards", () => {
    expect(sheetOffset(-30)).toBe(0);
    expect(sheetOffset(55)).toBe(55);
    expect(sheetOffset(Number.NaN)).toBe(0);
  });
});
