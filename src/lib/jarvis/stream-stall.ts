/**
 * JC-49: Jarvis streaming that never stalls silently.
 * - After JARVIS_STILL_WORKING_MS the chat shows a clearer "still working" hint
 *   with elapsed time (builder planning keeps its own 30s PLAN_SLOW_HINT_MS).
 * - After JARVIS_CLIENT_STALL_MS the client cuts off and may auto-retry once.
 * Pure helpers only; the page owns the AbortController and the one-retry flag.
 */

/** Show a clearer still-working hint once the turn has been busy this long. */
export const JARVIS_STILL_WORKING_MS = 8_000;

/**
 * Client-side stall cut-off for one Jarvis turn. Aligned with the server turn
 * deadline (JARVIS_TURN_DEADLINE_MS ≈ 110s) plus a short grace so a reply that
 * finishes at the wire does not race the cut-off. Documented for JC-49.
 */
export const JARVIS_CLIENT_STALL_MS = 120_000;

/** At most one automatic retry after a stall; never start a duplicate job. */
export const JARVIS_STALL_MAX_AUTO_RETRIES = 1;

export const jarvisIsStillWorking = (elapsedMs: number): boolean => elapsedMs >= JARVIS_STILL_WORKING_MS;

export const jarvisIsStalled = (elapsedMs: number, stallMs: number = JARVIS_CLIENT_STALL_MS): boolean =>
  elapsedMs >= stallMs;

/** True while the owner may still get one automatic stall retry (attempt is 0-based tries already used). */
export const jarvisCanAutoRetryStall = (autoRetriesUsed: number): boolean =>
  autoRetriesUsed < JARVIS_STALL_MAX_AUTO_RETRIES;

/** Owner-facing still-working line (elapsed is whole seconds). */
export function jarvisStillWorkingLabel(elapsedSeconds: number): string {
  const seconds = Math.max(0, Math.floor(elapsedSeconds));
  if (seconds * 1000 < JARVIS_STILL_WORKING_MS) return `Working · ${seconds}s`;
  return `Still working · ${seconds}s — this can take up to a couple of minutes`;
}
