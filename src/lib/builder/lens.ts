/**
 * Maths for the lens magnifier: a round loupe that follows the pointer over a
 * picture and shows the same spot enlarged. Pure functions so the placement,
 * clamping and keyboard steps are testable without a browser.
 */
export const LENS_ZOOM = 2.5;
export const LENS_SIZE = 148;
export const LENS_KEY_STEP = 0.05;

export type LensPlacement = {
  /** Loupe's top-left corner inside the picture, px. */
  left: number;
  top: number;
  /** Where the magnified picture sits inside the loupe, px (background-position). */
  bgX: number;
  bgY: number;
  /** Magnified picture size, px (background-size). */
  bgW: number;
  bgH: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** `fx`/`fy` are the pointer's position inside the picture as 0-1 fractions. */
export function lensPlacement(fx: number, fy: number, width: number, height: number, zoom = LENS_ZOOM, size = LENS_SIZE): LensPlacement {
  const x = clamp(fx, 0, 1) * width;
  const y = clamp(fy, 0, 1) * height;
  return {
    left: x - size / 2,
    top: y - size / 2,
    bgX: -(x * zoom - size / 2),
    bgY: -(y * zoom - size / 2),
    bgW: width * zoom,
    bgH: height * zoom,
  };
}

/** Arrow keys move the loupe in 5% steps; Home/End/Escape are handled by the caller. */
export function lensKeyMove(fx: number, fy: number, key: string): { fx: number; fy: number } | null {
  switch (key) {
    case "ArrowLeft": return { fx: clamp(fx - LENS_KEY_STEP, 0, 1), fy };
    case "ArrowRight": return { fx: clamp(fx + LENS_KEY_STEP, 0, 1), fy };
    case "ArrowUp": return { fx, fy: clamp(fy - LENS_KEY_STEP, 0, 1) };
    case "ArrowDown": return { fx, fy: clamp(fy + LENS_KEY_STEP, 0, 1) };
    default: return null;
  }
}
