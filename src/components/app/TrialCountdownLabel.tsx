import { useTrialCountdown } from "@/lib/trial-clock";

/**
 * The ticking "2d 03:14:07" label. It is its own component so only this text
 * re-renders every second, never the app layout or the page under it.
 */
export function TrialCountdownLabel({ endMs }: { endMs: number | null }) {
  const countdown = useTrialCountdown(endMs);
  if (!countdown) return null;
  return (
    <span className="tnum font-semibold" aria-live="off">
      {countdown.label}
    </span>
  );
}
