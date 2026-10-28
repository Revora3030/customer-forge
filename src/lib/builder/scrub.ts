/**
 * Maths for scroll-scrubbed video: a tall wrapper holds one pinned scene and
 * the video's playhead follows how far the visitor has scrolled through it.
 * Pure functions so the mapping is testable without a browser.
 */
/** How tall the scrolling track is, in screens of the viewport. */
export const SCRUB_SCREENS = 3;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** 0 when the track's top reaches the viewport top, 1 when its bottom reaches the viewport bottom. */
export function scrubProgress(trackTop: number, trackHeight: number, viewportHeight: number): number {
  const travel = trackHeight - viewportHeight;
  if (!(travel > 0)) return 0;
  return clamp(-trackTop / travel, 0, 1);
}

/** The playhead for a progress value. Stops just short of the end so the last frame stays on screen. */
export function scrubTime(progress: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return clamp(progress, 0, 1) * Math.max(duration - 0.05, 0);
}

/** Seeking on every scroll event stalls phones; only move once the playhead has really changed. */
export function shouldSeek(current: number, target: number, threshold = 0.03): boolean {
  return Math.abs(current - target) >= threshold;
}
