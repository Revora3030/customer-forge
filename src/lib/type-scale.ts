/**
 * Typography guardrails (Lovable round 6 #4, deepseek round 7 §7).
 *
 * Every fluid size is `clamp(min rem, a rem + b vw, max rem)`:
 *  - the preferred value always carries a rem term, so browser zoom and the
 *    visitor's font-size setting still scale the text (WCAG 1.4.4);
 *  - max ≤ 2.5 × min, so text can reach 200% zoom without layout blowout;
 *  - interpolation runs inside the 320px → 2560px viewport domain.
 * Pure string math: SSR-safe, no runtime measurement.
 */
export const TYPE_VIEWPORT_MIN_PX = 320;
export const TYPE_VIEWPORT_MAX_PX = 2560;
export const MAX_CLAMP_RATIO = 2.5;
const ROOT_PX = 16;

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * A rem-anchored fluid clamp from `minPx` at `fromPx` to `maxPx` at `toPx`.
 * If the authored range is wider than 2.5×, the floor is raised (never the
 * ceiling lowered) so the guard holds.
 */
export function fluidClamp(minPx: number, maxPx: number, fromPx = TYPE_VIEWPORT_MIN_PX, toPx = TYPE_VIEWPORT_MAX_PX): string {
  const hi = Math.max(minPx, maxPx);
  const lo = Math.max(Math.min(minPx, maxPx), hi / MAX_CLAMP_RATIO);
  const from = Math.max(TYPE_VIEWPORT_MIN_PX, Math.min(fromPx, TYPE_VIEWPORT_MAX_PX));
  const to = Math.max(from + 1, Math.min(toPx, TYPE_VIEWPORT_MAX_PX));
  const slope = (hi - lo) / (to - from);
  const interceptPx = lo - slope * from;
  // The rem term must survive rounding: a fluid size with no rem part ignores zoom.
  const interceptRem = Math.max(0.125, r3(interceptPx / ROOT_PX));
  const vw = r3(slope * 100);
  return `clamp(${r3(lo / ROOT_PX)}rem, ${interceptRem}rem + ${vw}vw, ${r3(hi / ROOT_PX)}rem)`;
}

export type ClampCheck = { ok: boolean; problems: string[]; min?: number; max?: number };

/** Check a font-size value against the guardrails. Non-clamp values pass (they are not fluid). */
export function checkTypeClamp(value: string): ClampCheck {
  const m = /^clamp\(\s*([\d.]+)(rem|px)\s*,\s*(.+?)\s*,\s*([\d.]+)(rem|px)\s*\)$/.exec(value.trim());
  if (!m) return { ok: !/^clamp\(/.test(value.trim()), problems: /^clamp\(/.test(value.trim()) ? ["unparseable clamp()"] : [] };
  const toPx = (n: string, unit: string) => Number(n) * (unit === "rem" ? ROOT_PX : 1);
  const min = toPx(m[1]!, m[2]!);
  const max = toPx(m[4]!, m[5]!);
  const problems: string[] = [];
  if (!/[\d.]+rem/.test(m[3]!)) problems.push("preferred value has no rem term (ignores zoom)");
  if (max > min * MAX_CLAMP_RATIO + 1e-6) problems.push(`max ${max}px is more than ${MAX_CLAMP_RATIO}× min ${min}px`);
  if (min > max) problems.push("min is larger than max");
  return { ok: problems.length === 0, problems, min, max };
}

/** Modular step scale: base 17px × 1.2ⁿ at 320px → base 19px × 1.25ⁿ at 2560px. */
export const TYPE_STEPS: Record<string, string> = Object.fromEntries(
  [-1, 0, 1, 2, 3, 4, 5, 6, 7].map((n) => [`--ds-step-${n}`, fluidClamp(17 * 1.2 ** n, 19 * 1.25 ** n)]),
);

/** Display register — used only at ≥48rem; never scaled down onto a 320px phone. */
export const DISPLAY_STEPS: Record<string, string> = {
  "--ds-display-1": fluidClamp(52, 104, 768, TYPE_VIEWPORT_MAX_PX),
  "--ds-display-2": fluidClamp(72, 168, 768, TYPE_VIEWPORT_MAX_PX),
};

/** Composition headings: authored size is the ceiling, reached at a 1440px desktop. */
export function headingClamp(authoredPx: number): string {
  const max = Math.round(authoredPx);
  // Never let the floor exceed the authored size (clamp() with min > max is invalid).
  const min = Math.min(max, Math.max(18, Math.round(max * 0.72)));
  return fluidClamp(min, max, TYPE_VIEWPORT_MIN_PX, 1440);
}

/** Cinematic scene headline: 51.2px on a 320px phone → 104px by 1440px. */
export const SCENE_HEADLINE_CLAMP = fluidClamp(51.2, 104, TYPE_VIEWPORT_MIN_PX, 1440);
