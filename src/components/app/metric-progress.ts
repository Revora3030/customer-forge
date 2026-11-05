/**
 * Progress bar state for a dashboard stat card.
 *
 * `value` is the true percentage (0-100) announced to assistive tech; `width`
 * is the painted width, floored at 2% so a real but tiny figure stays visible.
 * A figure that is not a finite number draws nothing instead of a broken bar.
 */
export type MetricProgress = { value: number; width: number };

export function metricProgress(progress: number | null | undefined): MetricProgress | null {
  if (typeof progress !== "number" || !Number.isFinite(progress)) return null;
  const clamped = Math.min(100, Math.max(0, progress));
  return { value: Math.round(clamped), width: Math.max(2, clamped) };
}
