/**
 * Pure pieces of Jarvis's voice playback, kept free of React and the DOM so
 * they can be unit-tested without a browser.
 */

export type PlaybackOutcome = "finished" | "stopped" | "fallback";

export type PlaybackGate = {
  /** Starts waiting for the current clip; an earlier wait still pending settles as "stopped". */
  begin(): Promise<PlaybackOutcome>;
  /** Settles the pending wait, if any. Later calls are ignored until the next begin(). */
  settle(outcome: PlaybackOutcome): void;
  /** True while a begin() is waiting. */
  pending(): boolean;
};

/**
 * One gate per voice hook. Pausing an <audio> element or cancelling
 * speechSynthesis fires no "ended" event, so without this stop() would leave
 * the play promise (and every caller awaiting speak()) hanging forever.
 */
export function createPlaybackGate(): PlaybackGate {
  let resolve: ((outcome: PlaybackOutcome) => void) | null = null;
  const settle = (outcome: PlaybackOutcome) => {
    const current = resolve;
    resolve = null;
    current?.(outcome);
  };
  return {
    begin() {
      settle("stopped");
      return new Promise<PlaybackOutcome>((done) => {
        resolve = done;
      });
    },
    settle,
    pending: () => resolve !== null,
  };
}

/** How long the browser voice may take on one chunk before Jarvis stops waiting for it. */
export function browserSpeechWatchdogMs(chars: number): number {
  return Math.max(4000, Math.max(0, chars) * 90) + 3000;
}

/** A streamed link that hasn't started playing by now is abandoned for the buffered download. */
export const STREAM_START_TIMEOUT_MS = 8000;
/** A stream that has stalled with no progress for this long is abandoned too. */
export const STREAM_STALL_TIMEOUT_MS = 6000;

/** Short, text-free codes for why Jarvis fell back to the browser voice. Safe to report. */
export type VoiceFallbackCode =
  | "quota_exceeded"
  | "detected_unusual_activity"
  | "invalid_api_key"
  | "missing_permissions"
  | "voice_not_found"
  | "payment_required"
  | "invalid_request"
  | "too_many_concurrent_requests"
  | "rate_limited"
  | "redirect_refused"
  | "unauthorized"
  | "budget_exhausted"
  | "link_used"
  | "not_configured"
  | "timeout"
  | "unreachable"
  | "no_link"
  | "playback_blocked"
  | "unavailable";

/**
 * Maps a fallback reason (the server's mapped ElevenLabs message, or the
 * hook's own) to its code. Only the code is ever reported, never the text.
 */
export function voiceFallbackCode(reason: string): VoiceFallbackCode {
  const text = reason.toLowerCase();
  const rules: [RegExp, VoiceFallbackCode][] = [
    [/quota is used up|quota_exceeded/, "quota_exceeded"],
    [/blocked this server|unusual/, "detected_unusual_activity"],
    [/api key was rejected|invalid_api_key/, "invalid_api_key"],
    [/missing a permission|missing_permissions/, "missing_permissions"],
    [/can't find the configured voice|voice_not_found/, "voice_not_found"],
    [/paid plan or payment/, "payment_required"],
    [/invalid request/, "invalid_request"],
    [/too many requests at once|concurrent/, "too_many_concurrent_requests"],
    [/rate limit|rate or credit/, "rate_limited"],
    [/redirect refused/, "redirect_refused"],
    [/rejected the server credential/, "unauthorized"],
    [/voice budget/, "budget_exhausted"],
    [/already been used/, "link_used"],
    [/not configured|isn't set/, "not_configured"],
    [/took too long/, "timeout"],
    [/could not be reached|couldn't reach/, "unreachable"],
    [/no elevenlabs link/, "no_link"],
    [/blocked the audio/, "playback_blocked"],
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? "unavailable";
}

const reported = new Set<string>();

/** True the first time a code is seen on this page load, so telemetry sends each code once. */
export function firstFallbackThisPage(code: string): boolean {
  if (reported.has(code)) return false;
  reported.add(code);
  return true;
}
