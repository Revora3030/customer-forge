/**
 * Settling the preview stage's measured size.
 *
 * The preview frame is sized from the stage it sits in, and the stage is
 * measured with a ResizeObserver. Sub-pixel readings (and the few pixels a
 * scrollbar takes when it appears) used to feed straight back into the frame
 * size, which resized the stage again — a loop that kept the frame animating
 * (it has a width/height transition) and never let it sit still long enough
 * for a click. Sizes are rounded and tiny changes ignored, so it settles.
 */
export type StageSize = { width: number; height: number };

/** Changes at or below this many pixels are measurement noise, not a resize. */
export const STAGE_JITTER_PX = 2;

export function settleStageSize(previous: StageSize, measured: StageSize): StageSize {
  const width = Math.max(0, Math.round(measured.width));
  const height = Math.max(0, Math.round(measured.height));
  const widthMoved = Math.abs(width - previous.width) > STAGE_JITTER_PX || previous.width === 0;
  const heightMoved = Math.abs(height - previous.height) > STAGE_JITTER_PX || previous.height === 0;
  if (!widthMoved && !heightMoved) return previous;
  return { width: widthMoved ? width : previous.width, height: heightMoved ? height : previous.height };
}
