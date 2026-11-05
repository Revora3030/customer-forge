/** Client-facing error text: preserve actionable access blocks without leaking internals. */
import { builderAccessBlock } from "@/lib/builder-access-error";

const TECHNICAL = [
  "row-level security", "rls", "violates", "constraint", "duplicate key", "postgrest", "pgrst",
  "relation ", "column ", "syntax error", "jwt", "supabase", "fetch failed", "failed to fetch",
  "networkerror", "internal server error", "500", "502", "503", "504", "unexpected token",
  "typeerror", "undefined is not", "null value in", "permission denied", "stack", "econn",
  "timeout of", "server function",
];

function raw(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message ?? "";
  if (typeof err === "object") {
    const e = err as { message?: unknown };
    if (typeof e.message === "string") return e.message;
  }
  return "";
}

export function friendlyError(err: unknown, fallback = "Something went wrong. Please try again.") {
  const message = raw(err).trim();
  if (!message) return fallback;
  // Known access blocks use fixed safe copy, even when the server explanation is long.
  const block = builderAccessBlock(message);
  if (block) return block.message;
  const lower = message.toLowerCase();
  if (TECHNICAL.some((marker) => lower.includes(marker))) return fallback;
  if (message.length > 180 || message.includes(" — at ") || message.includes("{")) return fallback;
  return message;
}

/**
 * Patterns that mean "this text came from a runtime or database, not from us":
 * JS error names and messages, stack frames, Postgres/PostgREST wording, and
 * low-level network failures. Deliberately narrower than `friendlyError`'s
 * marker list so ordinary product copy ("girls", "$500") is never rewritten.
 */
const RAW_ERROR_PATTERNS: readonly RegExp[] = [
  /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|EvalError|URIError|AggregateError)\b/,
  /cannot read propert(?:y|ies)/i,
  /\bis not (?:a function|defined|iterable|a constructor)\b/i,
  /\bundefined is not\b/i,
  /\bunexpected (?:token|end of (?:json|input))\b/i,
  /\[object \w+\]/,
  /\bat \S+ \(.*:\d+:\d+\)/,
  /\bat \S*[/.]\S*:\d+:\d+/,
  /\bPGRST\d+\b/i,
  /row-level security/i,
  /\bviolates (?:foreign key|unique|check|not-null)/i,
  /\bduplicate key value\b/i,
  /\b(?:relation|column) "[^"]+"/i,
  /\bnull value in column\b/i,
  /\bJWT\b/,
  /\binternal server error\b/i,
  /^\s*[{[]/,
];

const NETWORK_PATTERNS: readonly RegExp[] = [
  /failed to fetch/i,
  /fetch failed/i,
  /networkerror/i,
  /load failed/i,
  /network request failed/i,
  /\b(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND)\b/,
];

export const NETWORK_ERROR_COPY = "Couldn't reach Revora. Check your connection and try again.";
export const GENERIC_ERROR_COPY = "Something went wrong. Please try again.";

/**
 * Last line of defence for text shown to people in toasts: if the message is a
 * raw runtime/database error, show plain copy instead. Anything else (our own
 * wording) passes through unchanged.
 */
export function userSafeMessage(message: string): string {
  if (NETWORK_PATTERNS.some((pattern) => pattern.test(message))) return NETWORK_ERROR_COPY;
  if (RAW_ERROR_PATTERNS.some((pattern) => pattern.test(message))) return GENERIC_ERROR_COPY;
  return message;
}
