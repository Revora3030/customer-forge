/**
 * JC-48: every Jarvis failure tells the owner what failed, what was kept, and
 * the safe next step. No "Something went wrong". Pure so the same copy is
 * asserted in tests and reused by the chat page and server throws.
 */

export type HonestFailure = {
  /** What failed, in plain words. */
  whatFailed: string;
  /** What is still safe / unchanged. */
  whatKept: string;
  /** The one safe next step. */
  nextStep: string;
};

/** Known Jarvis chat failure kinds (top paths audited for JC-48). */
export type JarvisFailureKind =
  | "send"
  | "save_message"
  | "save_reply"
  | "history_load"
  | "history_after_send"
  | "regenerate"
  | "clear"
  | "timeout"
  | "network"
  | "rate_limited"
  | "quota"
  | "stall"
  | "generic";

const COPY: Record<JarvisFailureKind, HonestFailure> = {
  send: {
    whatFailed: "Jarvis could not finish this reply.",
    whatKept: "Your message is saved in this chat; nothing else was changed or sent.",
    nextStep: "Press Retry, or send the same question again.",
  },
  save_message: {
    whatFailed: "Your message could not be saved.",
    whatKept: "Nothing was sent to Jarvis and nothing on your site changed.",
    nextStep: "Check your connection, then send the message again.",
  },
  save_reply: {
    whatFailed: "Jarvis answered, but the reply could not be saved.",
    whatKept: "Your question is still in the chat; no approvals or sends ran.",
    nextStep: "Refresh the page before retrying so you do not double-send.",
  },
  history_load: {
    whatFailed: "Your Jarvis conversation could not be loaded.",
    whatKept: "Saved messages are still on the server; nothing was deleted.",
    nextStep: "Refresh the page. If it still fails, try again in a minute.",
  },
  history_after_send: {
    whatFailed: "Your message was saved, but chat history could not be reloaded.",
    whatKept: "The message is on the server; Jarvis may still be answering.",
    nextStep: "Refresh the page to see the latest reply.",
  },
  regenerate: {
    whatFailed: "Jarvis could not replace the last reply.",
    whatKept: "Your earlier messages and any approvals already decided stay as they were.",
    nextStep: "Press Get a reply again, or ask the question in a new message.",
  },
  clear: {
    whatFailed: "The chat could not be cleared.",
    whatKept: "Your conversation is unchanged.",
    nextStep: "Try Clear again in a moment.",
  },
  timeout: {
    whatFailed: "Revora AI took too long to answer this turn.",
    whatKept: "Your message is saved; nothing was changed or sent from here.",
    nextStep: "Try again with a shorter question, or press Retry.",
  },
  network: {
    whatFailed: "The connection to Jarvis dropped before a reply arrived.",
    whatKept: "Your message may already be saved; nothing was sent to a customer.",
    nextStep: "Refresh, then press Get a reply if the answer is missing.",
  },
  rate_limited: {
    whatFailed: "Revora AI is busy right now.",
    whatKept: "Your message is saved; nothing was changed or sent.",
    nextStep: "Wait a moment, then press Retry.",
  },
  quota: {
    whatFailed: "Revora AI is out of credits for this workspace.",
    whatKept: "Your message is saved; nothing was changed or sent.",
    nextStep: "Top up AI credits, then send the message again. Re-sending before then will not help.",
  },
  stall: {
    whatFailed: "Jarvis stopped making progress on this reply.",
    whatKept: "Your message is saved; no duplicate job was started beyond one automatic retry.",
    nextStep: "Press Get a reply to try once more, or send a shorter question.",
  },
  generic: {
    whatFailed: "Jarvis could not finish that step.",
    whatKept: "Nothing was changed or sent from this page.",
    nextStep: "Try again. If it keeps failing, open Operations and run the health checks.",
  },
};

/** Banned generic copy — callers must never surface these to the owner. */
export const BANNED_GENERIC_FAILURE = /something went wrong/i;

export function describeJarvisFailure(kind: JarvisFailureKind): HonestFailure {
  return COPY[kind];
}

/** One owner-facing sentence: what failed · what was kept · next step. */
export function jarvisFailureSentence(kind: JarvisFailureKind): string {
  const { whatFailed, whatKept, nextStep } = COPY[kind];
  return `${whatFailed} ${whatKept} ${nextStep}`;
}

/**
 * Maps a thrown error onto a known Jarvis failure kind. Prefers explicit
 * markers in the message (server throws) and AI categories when present.
 */
export function classifyJarvisError(error: unknown): JarvisFailureKind {
  const category = (error as { category?: unknown } | null | undefined)?.category;
  if (category === "quota") return "quota";
  if (category === "rate_limited") return "rate_limited";
  if (category === "timeout") return "timeout";

  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const lower = message.toLowerCase();
  if (!message || BANNED_GENERIC_FAILURE.test(message)) return "generic";
  if (/couldn'?t save your message|could not be saved\.?$/i.test(message) && /message/i.test(message)) return "save_message";
  if (/reply could not be saved|answered, but the reply/i.test(message)) return "save_reply";
  if (/message was saved, but chat history/i.test(message)) return "history_after_send";
  if (/couldn'?t load your jarvis chat|conversation could not be loaded/i.test(message)) return "history_load";
  if (/couldn'?t replace the last reply|nothing to regenerate/i.test(message)) return "regenerate";
  if (/couldn'?t clear/i.test(message)) return "clear";
  if (/took too long|timed out|timeout/i.test(lower)) return "timeout";
  if (/failed to fetch|networkerror|network|connection/i.test(lower)) return "network";
  if (/rate limit|too many requests|busy right now/i.test(lower)) return "rate_limited";
  if (/out of credits|quota/i.test(lower)) return "quota";
  if (/stall|stopped making progress/i.test(lower)) return "stall";
  return "send";
}

/** Toast / alert text for a thrown error on a Jarvis chat path. Never "Something went wrong". */
export function jarvisFailureToast(error: unknown, fallbackKind: JarvisFailureKind = "generic"): string {
  const kind = classifyJarvisError(error);
  // Prefer a specific known kind; if classification fell through to send/generic
  // but the error already has honest plain copy, keep that copy.
  if (kind !== "generic" && kind !== "send") return jarvisFailureSentence(kind);
  if (error instanceof Error && error.message.trim() && !BANNED_GENERIC_FAILURE.test(error.message)) {
    return error.message.trim();
  }
  return jarvisFailureSentence(fallbackKind);
}
