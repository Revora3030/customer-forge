import { getSpeechRecognition } from "@/lib/speech-input";

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

// ---------------------------------------------------------------------------
// Talk mode (JC-29) and its status UI (JC-30). Free browser SpeechRecognition
// only: nothing here turns on paid speech-to-text or text-to-speech.
// ---------------------------------------------------------------------------

/** What the mic is doing right now; the one value the status UI shows and announces. */
export type TalkState = "idle" | "listening" | "thinking" | "speaking";

/** Speaking wins (the owner is hearing Jarvis), then listening, then thinking. */
export function deriveTalkState(flags: { speaking: boolean; listening: boolean; busy: boolean }): TalkState {
  if (flags.speaking) return "speaking";
  if (flags.listening) return "listening";
  if (flags.busy) return "thinking";
  return "idle";
}

/** The sentence the single status live region announces. Empty when Talk is off and nothing needs saying. */
export function talkAnnouncement(state: TalkState, talkOn: boolean): string {
  if (!talkOn) return "";
  switch (state) {
    case "listening":
      return "Jarvis is listening.";
    case "thinking":
      return "Jarvis is thinking.";
    case "speaking":
      return "Jarvis is speaking. Tap to interrupt.";
    default:
      return "Talk mode is on. Tap to talk.";
  }
}

/** The label of the big Talk button for each state; speaking means a tap is a barge-in. */
export function talkButtonLabel(state: TalkState): string {
  switch (state) {
    case "listening":
      return "Listening…";
    case "thinking":
      return "Thinking…";
    case "speaking":
      return "Interrupt and talk";
    default:
      return "Tap to talk";
  }
}

/** The Talk button is only inert while the mic is already open or Jarvis is working out an answer. */
export function talkButtonDisabled(state: TalkState): boolean {
  return state === "listening" || state === "thinking";
}

export const TALK_UNSUPPORTED_MESSAGE =
  "Talk mode needs speech recognition, which this browser doesn't have. Type your message instead. Jarvis can still read replies aloud.";

export type TalkSupport = { supported: true } | { supported: false; message: string };

/** Talk mode works only with the browser's own (free) SpeechRecognition; otherwise say so and keep text. */
export function talkSupport(scope?: Parameters<typeof getSpeechRecognition>[0]): TalkSupport {
  const ctor = scope === undefined ? getSpeechRecognition() : getSpeechRecognition(scope);
  return ctor ? { supported: true } : { supported: false, message: TALK_UNSUPPORTED_MESSAGE };
}

export type RecognitionFailure = {
  /** True when retrying would fail the same way, so Talk mode must stop instead of looping. */
  fatal: boolean;
  /** Plain words for the owner, or null when the failure is routine (silence). */
  message: string | null;
};

/** Maps a SpeechRecognition error code to what Talk mode does about it. */
export function classifyRecognitionError(code: string | undefined): RecognitionFailure {
  switch (code) {
    case "no-speech":
    case "aborted":
      return { fatal: false, message: null };
    case "not-allowed":
    case "service-not-allowed":
      return { fatal: true, message: "Microphone access is blocked. Allow the microphone for this site, or type your message." };
    case "audio-capture":
      return { fatal: true, message: "No microphone was found. Plug one in, or type your message." };
    case "network":
      return { fatal: true, message: "The browser's speech recognition lost its connection. Type your message, or try Talk again." };
    case "language-not-supported":
      return { fatal: true, message: "This browser can't recognize English speech. Type your message instead." };
    default:
      return { fatal: true, message: "Voice input stopped. Type your message, or try Talk again." };
  }
}

/** How long the owner must stay quiet after their last words before Talk mode sends them. */
export const TALK_SILENCE_SEND_MS = 1500;

export type SilenceSender = {
  /** Call with the words heard so far (interim or final); restarts the silence countdown. */
  hear(heard: string): void;
  /** Stops the countdown and forgets the words; the sender can be used again. */
  cancel(): void;
  /** True once the words have been sent; later hear() calls are ignored until cancel(). */
  sent(): boolean;
};

type TimerApi = {
  set: (callback: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

/**
 * Sends what was heard once the owner has been quiet for `delayMs`, exactly
 * once. Browsers differ in how soon they mark the last words final, so Talk
 * mode does not wait on that: silence is what sends.
 */
export function createSilenceSender(
  onSilence: (heard: string) => void,
  delayMs: number = TALK_SILENCE_SEND_MS,
  timers: TimerApi = {
    set: (callback, ms) => setTimeout(callback, ms),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
): SilenceSender {
  let handle: unknown = null;
  let heard = "";
  let done = false;
  const clear = () => {
    if (handle !== null) timers.clear(handle);
    handle = null;
  };
  return {
    hear(next) {
      const text = next.trim();
      if (done || !text) return;
      heard = text;
      clear();
      handle = timers.set(() => {
        handle = null;
        if (done || !heard) return;
        done = true;
        onSilence(heard);
      }, delayMs);
    },
    cancel() {
      clear();
      heard = "";
      done = false;
    },
    sent: () => done,
  };
}
