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

/**
 * Which frame a scroll-scrubbed still sequence is on, and how far (0–1) the
 * wipe toward the next frame has travelled. The last frame is fully shown at
 * progress 1. One frame never wipes.
 */
export function scrubFrame(progress: number, count: number): { index: number; mix: number } {
  if (!Number.isFinite(count) || count <= 1) return { index: 0, mix: 0 };
  const t = clamp(progress, 0, 1);
  if (t >= 1) return { index: count - 1, mix: 0 };
  const scaled = t * (count - 1);
  const index = Math.min(count - 2, Math.floor(scaled));
  return { index, mix: scaled - index };
}

/**
 * The progress readout over a scroll-scrubbed sequence (the ring with "49%" and
 * "2/3 · Roof soft wash" in the reference look): a whole-number percent of the
 * scroll travelled and which labelled frame the visitor is nearest. Labels are
 * the AI's own frame captions; a frame without one shows only its number.
 */
export function scrubReadout(progress: number, labels: readonly (string | null | undefined)[]): { percent: number; step: number; total: number; label: string } {
  const total = Math.max(1, labels.length);
  const t = clamp(Number.isFinite(progress) ? progress : 0, 0, 1);
  const step = Math.min(total, Math.floor(t * total) + 1);
  return { percent: Math.round(t * 100), step, total, label: (labels[step - 1] ?? "").trim() };
}

/**
 * How many stills a scroll-scrubbed sequence may hold. Up to six frames may
 * include generated atmosphere; a longer sequence is the owner's own
 * photographs only (a real camera move), capped at 18 so phones are not asked
 * to decode a film's worth of stills. From ten real frames the sequence
 * cross-fades instead of wiping, so the move reads as smooth motion.
 */
export const SCRUB_FRAME_LIMITS = { min: 2, max: 18, atmosphereMax: 6, smoothMin: 10 } as const;

/**
 * The frames a sequence actually shows: unchanged up to six; beyond that only
 * real (non-generated) frames, at most 18. If fewer than two real frames are
 * left, the first six authored frames show, as before.
 */
export function capScrubFrames<T extends { generated?: boolean }>(frames: readonly T[]): T[] {
  if (frames.length <= SCRUB_FRAME_LIMITS.atmosphereMax) return [...frames];
  const real = frames.filter((frame) => !frame.generated);
  if (real.length < SCRUB_FRAME_LIMITS.min) return frames.slice(0, SCRUB_FRAME_LIMITS.atmosphereMax);
  return real.slice(0, SCRUB_FRAME_LIMITS.max);
}

/** A wipe for short sequences; a cross-fade once there are enough real frames to read as motion. */
export function scrubTransition(count: number): "wipe" | "crossfade" {
  return count >= SCRUB_FRAME_LIMITS.smoothMin ? "crossfade" : "wipe";
}
