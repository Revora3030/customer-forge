/**
 * Was this failure a passing glitch, or a real refusal?
 *
 * A dropped connection, a gateway hiccup or a request that timed out will very
 * likely succeed on a second attempt, so it is worth retrying quietly. A
 * refusal — not allowed, not paid, not ready, invalid — will fail identically
 * forever, and retrying it only wastes the owner's time and hides the real
 * reason. Only the first kind is treated as transient.
 */

const TRANSIENT_FRAGMENTS = [
  "failed to fetch",
  "fetch failed",
  "networkerror",
  "network error",
  "load failed",
  "connection closed",
  "connection reset",
  "econnreset",
  "econnrefused",
  "etimedout",
  "enotfound",
  "socket hang up",
  "timeout",
  "timed out",
  "aborted",
  "temporarily unavailable",
  "service unavailable",
  "bad gateway",
  "gateway timeout",
  "too many requests",
  "rate limit",
  "internal server error",
  "502",
  "503",
  "504",
  "429",
  "upstream",
];

/** Refusals — these must never be retried, however they are worded. */
const PERMANENT_FRAGMENTS = [
  "unauthorized",
  "forbidden",
  "not allowed",
  "permission",
  "row-level security",
  "invalid",
  "not ready",
  "blocked",
  "suspended",
  "setup",
  "payment",
  "unpaid",
  "already",
  "not found",
  "does not exist",
];

function messageOf(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message ?? "";
  if (typeof error === "object") {
    const shaped = error as { message?: unknown; status?: unknown; statusCode?: unknown };
    const status = Number(shaped.status ?? shaped.statusCode ?? NaN);
    const text = typeof shaped.message === "string" ? shaped.message : "";
    return Number.isFinite(status) ? `${text} ${status}` : text;
  }
  return "";
}

/** True when retrying the same action has a real chance of succeeding. */
export function isTransientFailure(error: unknown): boolean {
  const text = messageOf(error).toLowerCase();
  if (!text.trim()) {
    // An error with nothing to read is usually the network layer giving up
    // before the server answered at all, which is worth one more attempt.
    return true;
  }
  if (PERMANENT_FRAGMENTS.some((fragment) => text.includes(fragment))) return false;
  return TRANSIENT_FRAGMENTS.some((fragment) => text.includes(fragment));
}

/** Waits with growing gaps so a struggling service is not hammered. */
export function retryDelayMs(attempt: number): number {
  const base = 600 * 2 ** Math.max(0, attempt - 1);
  return Math.min(6_000, base);
}

/**
 * Runs `action`, retrying only passing glitches, up to `attempts` times total.
 * The last error is rethrown so the caller can explain it to the owner.
 */
export async function withTransientRetry<T>(
  action: (attempt: number) => Promise<T>,
  options: {
    attempts?: number;
    onRetry?: (attempt: number, error: unknown) => void;
    /** Overrides the wait between attempts; used by tests to run instantly. */
    delayMs?: (attempt: number) => number;
  } = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await action(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !isTransientFailure(error)) throw error;
      options.onRetry?.(attempt, error);
      const wait = options.delayMs?.(attempt) ?? retryDelayMs(attempt);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw lastError;
}
