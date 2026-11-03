/** Render budget for the AI City (Lovable round 10, item 5). */

/** Below this width the city is a flat SVG map: no three.js download, WebGL context or render loop on phones. */
export const CITY_2D_QUERY = "(max-width: 767px)";

/** Device pixel ratio range for the city canvas. */
export const CITY_DPR_MIN = 1;
export const CITY_DPR_MAX = 1.5;
/** Frames per second while a district is animating; idle scenes render only when something changes. */
export const CITY_ANIMATION_FPS = 30;

export function cityDprCeiling(devicePixelRatio: number | undefined): number {
  const ratio = Number.isFinite(devicePixelRatio) && (devicePixelRatio ?? 0) > 0 ? (devicePixelRatio as number) : 1;
  return Math.min(Math.max(ratio, CITY_DPR_MIN), CITY_DPR_MAX);
}
