/**
 * Pure keyboard and pointer maths for the before/after comparison slider, so
 * the rules are unit tested and identical everywhere it is rendered.
 */

export const SLIDER_STEP = 5;

export function clampSplit(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

/** New split for a key press, or null when the key does nothing. */
export function splitForKey(key: string, current: number, step = SLIDER_STEP): number | null {
  switch (key) {
    case "ArrowLeft":
    case "ArrowDown":
      return clampSplit(current - step);
    case "ArrowRight":
    case "ArrowUp":
      return clampSplit(current + step);
    case "PageDown":
      return clampSplit(current - step * 4);
    case "PageUp":
      return clampSplit(current + step * 4);
    case "Home":
      return 0;
    case "End":
      return 100;
    default:
      return null;
  }
}

/** Split for a pointer at clientX over an element spanning [left, left+width]. */
export function splitForPointer(clientX: number, left: number, width: number): number {
  if (!(width > 0)) return 50;
  return clampSplit(((clientX - left) / width) * 100);
}
