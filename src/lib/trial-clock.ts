/**
 * Server-anchored trial countdown.
 *
 * `useTrialCountdown` ticks every second like a normal clock, but the elapsed
 * time is measured against the server's clock, not the device's. The offset is
 * measured once per session and re-measured whenever the client returns to the
 * tab, so the timer stays accurate while the client is away and cannot be
 * extended by changing the phone's date.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getServerTime } from "@/lib/server-clock.functions";
import { countdownParts, useNow, type Countdown } from "@/lib/use-countdown";

/** Milliseconds to add to `Date.now()` to get server time (0 until measured). */
export function useServerClockOffset(): number {
  const fetchTime = useServerFn(getServerTime);
  const { data } = useQuery({
    queryKey: ["server_clock"],
    queryFn: async () => {
      const sentAt = Date.now();
      const { now } = await fetchTime();
      // Split the round trip so the offset isn't biased by network latency.
      const roundTrip = Date.now() - sentAt;
      return now + roundTrip / 2 - Date.now();
    },
    // Re-measure when the client comes back to the tab, and hourly while open.
    refetchOnWindowFocus: true,
    refetchInterval: 3_600_000,
    staleTime: 60_000,
    retry: 1,
  });
  return Number.isFinite(data) ? (data as number) : 0;
}

/** Live countdown to `endMs`, measured on server time. */
export function useTrialCountdown(endMs: number | null): Countdown | null {
  const offset = useServerClockOffset();
  const now = useNow(1000);
  return countdownParts(endMs, now + offset);
}

/** setTimeout's ceiling (~24.8 days); longer waits are re-armed in steps. */
export const MAX_TIMER_MS = 2_147_483_647;

/**
 * How long to wait before the trial's expired/active state can next change,
 * or null when it never will (no deadline, or already expired).
 */
export function trialFlipDelay(endMs: number | null, serverNow: number): number | null {
  if (endMs === null || !Number.isFinite(endMs)) return null;
  const left = endMs - serverNow;
  if (left <= 0) return null;
  return Math.min(MAX_TIMER_MS, left + 50);
}

/**
 * Only whether the trial has run out, re-rendering ONLY when that flips.
 *
 * The app layout used `useTrialCountdown` for this, which re-rendered the whole
 * layout — and so every page under it, the builder included — once a second
 * for the whole trial. The ticking label now lives in its own small component.
 */
export function useTrialExpiry(endMs: number | null): { expired: boolean } | null {
  const offset = useServerClockOffset();
  const known = endMs !== null && Number.isFinite(endMs);
  const read = () => known && (endMs as number) - (Date.now() + offset) <= 0;
  const [expired, setExpired] = useState(read);
  useEffect(() => {
    if (!known) return;
    const sync = () => setExpired(read());
    sync();
    const delay = trialFlipDelay(endMs, Date.now() + offset);
    const id = delay === null ? undefined : window.setTimeout(sync, delay);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      if (id !== undefined) window.clearTimeout(id);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
    // `read` closes over exactly these values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endMs, offset, known, expired]);
  return known ? { expired } : null;
}
