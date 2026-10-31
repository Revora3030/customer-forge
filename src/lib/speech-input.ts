// Free, browser-only dictation (Web Speech API). No server, no credits, no new dependency.
// Support is partial (Chrome and Safari yes; Firefox off by default), so callers must
// hide the mic when `getSpeechRecognition()` returns null and keep the text box as the fallback.

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** The browser's SpeechRecognition constructor, or null when unsupported (or on the server). */
export function getSpeechRecognition(
  scope: { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown } | undefined = typeof window ===
  "undefined"
    ? undefined
    : (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }),
): SpeechRecognitionCtor | null {
  if (!scope) return null;
  const ctor = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  return typeof ctor === "function" ? (ctor as SpeechRecognitionCtor) : null;
}

/** Append a spoken phrase to what is already typed, with one space between, and trim the ends. */
export function appendTranscript(existing: string, spoken: string): string {
  const add = spoken.trim().replace(/\s+/g, " ");
  if (!add) return existing;
  const base = existing.trimEnd();
  return base ? `${base} ${add}` : add;
}
