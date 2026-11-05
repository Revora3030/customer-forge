/**
 * CG-09: free, local, conservative photo touch-up.
 *
 * Pure pixel maths on RGBA data (no network, no paid call, no dependency), so it
 * runs in the browser on upload and is fully testable in Node. It only does what
 * is safe to do automatically: stretch the tonal range (levels), nudge overall
 * brightness with a gamma curve, and add a touch of colour. A photo that is
 * already fine is left alone, and a photo that is too dark or flat to rescue is
 * reported as such instead of being mangled. The caller always keeps the
 * original. Straightening is NOT attempted: horizon detection is not reliable
 * enough to run unattended.
 */

export type PhotoStats = {
  /** Opaque pixels counted. */
  pixels: number;
  /** 0-255 */
  mean: number;
  /** 1st and 99th percentile of luma, 0-255 */
  p1: number;
  p99: number;
};

export type EnhancePlan =
  | { apply: false; reason: "already_good" | "too_dark" | "too_flat" | "too_small" }
  | { apply: true; black: number; white: number; gamma: number; saturation: number };

export const ENHANCE_MIN_PIXELS = 400;
const TARGET_MEAN = 0.46;

const lumaOf = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export function analyzeRgba(data: ArrayLike<number>): PhotoStats {
  const hist = new Uint32Array(256);
  let pixels = 0;
  let sum = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if ((data[i + 3] ?? 0) < 128) continue;
    const l = Math.round(lumaOf(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0));
    hist[l] = (hist[l] ?? 0) + 1;
    sum += l;
    pixels += 1;
  }
  if (pixels === 0) return { pixels: 0, mean: 0, p1: 0, p99: 0 };
  const percentile = (q: number) => {
    const target = pixels * q;
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += hist[v] ?? 0;
      if (seen >= target) return v;
    }
    return 255;
  };
  return { pixels, mean: sum / pixels, p1: percentile(0.01), p99: percentile(0.99) };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function planEnhancement(stats: PhotoStats): EnhancePlan {
  if (stats.pixels < ENHANCE_MIN_PIXELS) return { apply: false, reason: "too_small" };
  // Almost no light anywhere: brightening would only reveal noise.
  if (stats.mean < 22 && stats.p99 < 70) return { apply: false, reason: "too_dark" };
  // Almost no tonal range: nothing to stretch.
  if (stats.p99 - stats.p1 < 25) return { apply: false, reason: "too_flat" };

  const black = stats.p1 > 6 ? clamp(stats.p1 - 2, 0, 40) : 0;
  const white = stats.p99 < 249 ? clamp(stats.p99 + 2, 190, 255) : 255;
  const span = Math.max(1, white - black);
  const stretched = clamp((stats.mean - black) / span, 0.02, 0.98);
  // Gamma that moves the average toward a natural mid-tone, never by much.
  const gamma = clamp(Math.log(TARGET_MEAN) / Math.log(stretched), 0.65, 1.3);

  const needsLevels = black >= 6 || white <= 245;
  const needsTone = Math.abs(gamma - 1) > 0.15;
  if (!needsLevels && !needsTone) return { apply: false, reason: "already_good" };
  return { apply: true, black, white, gamma, saturation: 1.08 };
}

/** Applies a plan in place. Alpha is never touched. */
export function applyEnhancement(data: Uint8ClampedArray, plan: EnhancePlan): boolean {
  if (!plan.apply) return false;
  const lut = new Uint8ClampedArray(256);
  const span = Math.max(1, plan.white - plan.black);
  for (let v = 0; v < 256; v++) {
    const normal = clamp((v - plan.black) / span, 0, 1);
    lut[v] = Math.round(Math.pow(normal, plan.gamma) * 255);
  }
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = lut[data[i] ?? 0] ?? 0;
    const g = lut[data[i + 1] ?? 0] ?? 0;
    const b = lut[data[i + 2] ?? 0] ?? 0;
    const l = lumaOf(r, g, b);
    data[i] = l + (r - l) * plan.saturation;
    data[i + 1] = l + (g - l) * plan.saturation;
    data[i + 2] = l + (b - l) * plan.saturation;
  }
  return true;
}

export type EnhanceResult = { changed: boolean; plan: EnhancePlan; before: PhotoStats; after: PhotoStats };

/** Analyse, plan and apply in one go on a full-size buffer. */
export function enhanceRgba(data: Uint8ClampedArray): EnhanceResult {
  const before = analyzeRgba(data);
  const plan = planEnhancement(before);
  const changed = applyEnhancement(data, plan);
  return { changed, plan, before, after: changed ? analyzeRgba(data) : before };
}

/** Plain-English reason for the owner when nothing was changed. */
export function enhanceNote(result: EnhanceResult): string {
  if (result.changed) return "Touched up: brighter and clearer. Your original is kept.";
  if (!result.plan.apply) {
    switch (result.plan.reason) {
      case "too_dark":
        return "This photo is very dark, so it was left as is. A brighter shot will look better.";
      case "too_flat":
        return "This photo has very little contrast, so it was left as is.";
      case "too_small":
        return "This photo is tiny, so it was left as is.";
      default:
        return "Already looks good; left as is.";
    }
  }
  return "Left as is.";
}
