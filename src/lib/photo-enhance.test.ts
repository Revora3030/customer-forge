import { describe, expect, it } from "vitest";
import { analyzeRgba, applyEnhancement, enhanceNote, enhanceRgba, planEnhancement } from "@/lib/photo-enhance";

/** Deterministic gradient photo: luma spread between lo and hi, with a little colour. */
function photo(lo: number, hi: number, pixels = 4096, alpha = 255) {
  const data = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < pixels; i++) {
    const v = lo + ((hi - lo) * i) / (pixels - 1);
    data[i * 4] = Math.min(255, v + 6);
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = Math.max(0, v - 6);
    data[i * 4 + 3] = alpha;
  }
  return data;
}

describe("photo enhance (CG-09)", () => {
  it("brightens and stretches a dull, dark photo", () => {
    const data = photo(30, 140);
    const before = analyzeRgba(data);
    const result = enhanceRgba(data);
    expect(result.changed).toBe(true);
    expect(result.after.mean).toBeGreaterThan(before.mean + 20);
    expect(result.after.p99 - result.after.p1).toBeGreaterThan(before.p99 - before.p1 + 40);
    expect(enhanceNote(result)).toMatch(/original is kept/);
  });

  it("stretches a washed-out photo", () => {
    const result = enhanceRgba(photo(90, 200));
    expect(result.changed).toBe(true);
    expect(result.after.p1).toBeLessThan(result.before.p1);
  });

  it("leaves a well-exposed photo alone, byte for byte", () => {
    const data = photo(0, 255);
    const copy = new Uint8ClampedArray(data);
    const result = enhanceRgba(data);
    expect(result.changed).toBe(false);
    expect(result.plan).toEqual({ apply: false, reason: "already_good" });
    expect(Array.from(data)).toEqual(Array.from(copy));
  });

  it("refuses to mangle photos that are too dark, too flat or too small", () => {
    expect(planEnhancement(analyzeRgba(photo(0, 40)))).toEqual({ apply: false, reason: "too_dark" });
    expect(planEnhancement(analyzeRgba(photo(120, 130)))).toEqual({ apply: false, reason: "too_flat" });
    expect(planEnhancement(analyzeRgba(photo(30, 140, 50)))).toEqual({ apply: false, reason: "too_small" });
    expect(enhanceNote(enhanceRgba(photo(0, 40)))).toMatch(/very dark/);
  });

  it("never touches transparency and ignores transparent pixels in the stats", () => {
    const data = photo(30, 140, 4096, 255);
    for (let i = 0; i < 100; i++) data[i * 4 + 3] = 40;
    const alphaBefore = Array.from(data).filter((_, i) => i % 4 === 3);
    enhanceRgba(data);
    expect(Array.from(data).filter((_, i) => i % 4 === 3)).toEqual(alphaBefore);
    expect(analyzeRgba(new Uint8ClampedArray(4096 * 4)).pixels).toBe(0);
  });

  it("keeps the change gentle: gamma and levels stay inside their caps", () => {
    const plan = planEnhancement({ pixels: 10_000, mean: 60, p1: 50, p99: 120 });
    expect(plan.apply).toBe(true);
    if (plan.apply) {
      expect(plan.black).toBeLessThanOrEqual(40);
      expect(plan.white).toBeGreaterThanOrEqual(190);
      expect(plan.gamma).toBeGreaterThanOrEqual(0.65);
      expect(plan.gamma).toBeLessThanOrEqual(1.3);
    }
  });

  it("is deterministic and idempotent enough: a second pass changes little", () => {
    const a = photo(30, 140);
    const b = photo(30, 140);
    enhanceRgba(a);
    enhanceRgba(b);
    expect(Array.from(a)).toEqual(Array.from(b));
    const second = enhanceRgba(a);
    expect(Math.abs(second.after.mean - second.before.mean)).toBeLessThan(25);
  });

  it("applyEnhancement with a no-op plan does nothing", () => {
    const data = photo(0, 255, 500);
    expect(applyEnhancement(data, { apply: false, reason: "already_good" })).toBe(false);
  });
});
