import { describe, expect, it } from "vitest";
import { DONE_AT_PERCENT, GRID_COLS, GRID_ROWS, brushRadius, coveragePercent, coverRect, isRevealDone, newGrid, paintAt, strokePoints } from "./reveal-brush";

describe("brush size", () => {
  it("scales with the picture and stays between a thumb and a hand", () => {
    expect(brushRadius(100)).toBe(24);
    expect(brushRadius(500)).toBe(45);
    expect(brushRadius(5000)).toBe(72);
    expect(brushRadius(0)).toBe(24);
    expect(brushRadius(Number.NaN)).toBe(24);
  });
});

describe("painting and coverage", () => {
  it("reveals cells under the brush once and never counts them twice", () => {
    const grid = newGrid();
    const first = paintAt(grid, 240, 160, 60, 480, 320);
    expect(first).toBeGreaterThan(0);
    expect(coveragePercent(grid)).toBe(Math.floor((first / (GRID_COLS * GRID_ROWS)) * 100));
    expect(paintAt(grid, 240, 160, 60, 480, 320)).toBe(0);
    expect(grid.revealed).toBe(first);
  });
  it("stays inside the frame and ignores bad input", () => {
    const grid = newGrid();
    expect(paintAt(grid, -500, -500, 40, 480, 320)).toBe(0);
    expect(paintAt(grid, 10, 10, 40, 0, 320)).toBe(0);
    expect(paintAt(grid, Number.NaN, 10, 40, 480, 320)).toBe(0);
    expect(coveragePercent(grid)).toBe(0);
  });
  it("reaches the done threshold only after most of the picture is swept", () => {
    const grid = newGrid();
    const w = 480, h = 320, radius = brushRadius(w);
    expect(isRevealDone(coveragePercent(grid))).toBe(false);
    let last = { x: 0, y: 0 };
    for (let row = 0; row <= 8; row += 1) {
      const y = (row / 8) * h;
      const ends = row % 2 === 0 ? [0, w] : [w, 0];
      for (const x of ends) {
        for (const p of strokePoints(last, { x, y }, radius)) paintAt(grid, p.x, p.y, radius, w, h);
        last = { x, y };
      }
    }
    expect(coveragePercent(grid)).toBeGreaterThanOrEqual(DONE_AT_PERCENT);
    expect(isRevealDone(coveragePercent(grid))).toBe(true);
  });
  it("leaves no gaps in a fast swipe", () => {
    const pts = strokePoints({ x: 0, y: 0 }, { x: 400, y: 0 }, 40);
    expect(pts.at(-1)).toEqual({ x: 400, y: 0 });
    for (let i = 1; i < pts.length; i += 1) expect(pts[i]!.x - pts[i - 1]!.x).toBeLessThanOrEqual(20);
  });
});

describe("coverRect", () => {
  it("fills the frame and centres the overflow, like object-fit: cover", () => {
    expect(coverRect(1000, 500, 400, 400)).toEqual({ x: -200, y: 0, w: 800, h: 400 });
    expect(coverRect(500, 1000, 400, 400)).toEqual({ x: 0, y: -200, w: 400, h: 800 });
    expect(coverRect(0, 0, 400, 300)).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });
});
