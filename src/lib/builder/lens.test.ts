import { describe, expect, it } from "vitest";
import { LENS_SIZE, LENS_ZOOM, lensKeyMove, lensPlacement } from "./lens";

describe("lens placement", () => {
  it("centres the loupe on the pointer and enlarges the same spot", () => {
    const p = lensPlacement(0.5, 0.5, 400, 300);
    expect(p.left).toBe(200 - LENS_SIZE / 2);
    expect(p.top).toBe(150 - LENS_SIZE / 2);
    expect(p.bgW).toBe(400 * LENS_ZOOM);
    // the picture's centre lands in the loupe's centre
    expect(p.bgX + (200 * LENS_ZOOM)).toBe(LENS_SIZE / 2);
    expect(p.bgY + (150 * LENS_ZOOM)).toBe(LENS_SIZE / 2);
  });

  it("clamps a pointer outside the picture to its edge", () => {
    expect(lensPlacement(-2, 9, 400, 300)).toEqual(lensPlacement(0, 1, 400, 300));
  });

  it("moves 5% per arrow key and ignores other keys", () => {
    expect(lensKeyMove(0.5, 0.5, "ArrowRight")).toEqual({ fx: 0.55, fy: 0.5 });
    expect(lensKeyMove(0, 0.5, "ArrowLeft")).toEqual({ fx: 0, fy: 0.5 });
    expect(lensKeyMove(0.5, 1, "ArrowDown")).toEqual({ fx: 0.5, fy: 1 });
    expect(lensKeyMove(0.5, 0.5, "a")).toBeNull();
  });
});
