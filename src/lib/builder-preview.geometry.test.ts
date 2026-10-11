import { describe, expect, it } from "vitest";
import { compareScale, fitZoom, previewPath, previewZoom } from "./builder-preview";

describe("preview geometry under constrained widths", () => {
  it.each([320, 390, 768, 1280, 1440, 2560])("fits a %i pixel frame in a narrow stage", (width) => {
    const scale = fitZoom(240, width);
    expect(Number.isFinite(scale)).toBe(true);
    expect(scale).toBeGreaterThan(0);
    expect(width * scale).toBeLessThanOrEqual(216.000001);
  });
  it.each([320, 1280, 2560])("fits two %i pixel panes without a minimum-scale overflow", (width) => {
    const scale = compareScale("side", 0.75, 240, width);
    expect(width * scale * 2 + 36).toBeLessThanOrEqual(240.000001);
  });
  it.each([NaN, Infinity, -Infinity, 0, -5])("handles invalid dimensions %s", (value) => {
    expect(fitZoom(value, 1280)).toBe(0.75);
    expect(fitZoom(390, value)).toBe(0.75);
    expect(compareScale("side", NaN, value, 1280)).toBe(0.75);
  });
  it("preserves the user's cap and private draft routing", () => {
    expect(compareScale("side", 0.5, 4000, 1280)).toBe(0.5);
    expect(compareScale("overlay", 0.5, 390, 1280)).toBe(0.5);
    expect(previewPath("acme", "home")).toBe("/draft/acme");
    expect(previewPath("acme", "contact")).toBe("/draft/acme/contact");
    expect(previewZoom(Infinity)).toBe(0.75);
  });
});
