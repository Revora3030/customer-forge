/**
 * One automatic retry for a builder AI step, plus the plain-language message
 * for every way the AI team can be unavailable. Pure and dependency-free so it
 * runs on the server, in the browser and in unit tests.
 *
 * Retry rules (the router and the thinker already walk a model roster with
 * their own per-step caps, so this adds exactly ONE more attempt at the whole
 * step, and only where a second try can plausibly succeed):
 *  - transient provider failures (busy, rate limited, unreachable, an unreadable
 *    answer) are retried once after a short backoff;
 *  - account/credit/configuration failures, a spending cap and a reviewer's
 *    refusal are NOT retried: the same call fails the same way;
 *  - a step that already ran for a long time is NOT retried here: the slow-step
 *    and timeout handling belongs to the build worker, and a second long call
 *    would run into the platform ceiling.
 */

/** Failure reasons where a second attempt is worth making. */
const RETRYABLE_REASONS = new Set([
  "provider_unavailable",
  "rate_limited",
  "bad_response",
  "review_unavailable",
]);

/** Reasons where retrying (by the owner too) cannot help until someone changes the account setup. */
const NEEDS_SETUP_REASONS = new Set(["unauthorized", "no_key", "no_tier_available", "free_only", "disabled"]);

/** A step that failed after running this long is never retried automatically. */
export const RETRY_ONLY_IF_FAILED_WITHIN_MS = 45_000;
/** Short pause before the one retry, long enough for a rate limit or a blip to clear. */
export const RETRY_BACKOFF_MS = 2_500;

export const isRetryableAiReason = (reason: string | null | undefined): boolean =>
  RETRYABLE_REASONS.has(String(reason ?? ""));

export type RetryReport = { attempts: 1 | 2; retried: boolean; firstReason: string | null };

/**
 * Runs `run`; if it reports a retryable failure quickly, waits `backoffMs` and
 * runs it once more. Returns the final result and a record of what happened.
 */
export async function retryOnceOnTransient<T extends { ok: boolean; reason?: string }>(
  run: (attempt: 1 | 2) => Promise<T>,
  options: {
    backoffMs?: number;
    maxFirstAttemptMs?: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    onRetry?: (reason: string) => void;
  } = {},
): Promise<{ result: T; report: RetryReport }> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const started = now();
  const first = await run(1);
  const reason = first.ok ? null : (first.reason ?? "unknown");
  const quick = now() - started <= (options.maxFirstAttemptMs ?? RETRY_ONLY_IF_FAILED_WITHIN_MS);
  if (first.ok || !isRetryableAiReason(reason) || !quick) {
    return { result: first, report: { attempts: 1, retried: false, firstReason: reason } };
  }
  options.onRetry?.(reason ?? "unknown");
  await sleep(options.backoffMs ?? RETRY_BACKOFF_MS);
  const second = await run(2);
  return { result: second, report: { attempts: 2, retried: true, firstReason: reason } };
}

export type UnavailableCopy = {
  /** What Revora says in the chat: what happened, what is safe, what to do next. */
  reply: string;
  /** Whether a Retry button helps. */
  retryable: boolean;
};

/**
 * The chat message when the design step could not run. `retried` says whether
 * the automatic second attempt was really made, so the copy never claims it.
 * `supportEmail` is only mentioned where retrying cannot help.
 */
export function describeAiUnavailable(
  reason: string | null | undefined,
  options: { retried?: boolean; supportEmail?: string | null } = {},
): UnavailableCopy {
  const r = String(reason ?? "");
  const tried = options.retried ? "I tried twice" : "I tried";
  const safe = "Your website and draft are exactly as they were, so nothing is lost. I'd rather wait than drop a stock layout onto your site.";
  if (NEEDS_SETUP_REASONS.has(r)) {
    return {
      retryable: false,
      reply: `The AI team can't take requests right now because the AI service isn't set up or authorised for this workspace, so retrying won't help yet. ${safe}${options.supportEmail ? ` Please contact ${options.supportEmail} so it can be fixed, then ask again.` : " Once that is fixed, ask again."}`,
    };
  }
  if (r === "budget_exhausted" || r === "ledger_unavailable") {
    return {
      retryable: true,
      reply: `I couldn't start this change because the AI usage limit for now has been reached (or couldn't be checked). ${safe} Press Retry to check again — if it still says this, it will clear when the limit resets.`,
    };
  }
  if (r === "review_unavailable") {
    return {
      retryable: true,
      reply: `${tried}, but the independent fact and safety check couldn't run, and I won't change your site without it. ${safe} Press Retry to run it again.`,
    };
  }
  if (r === "unusable_answer" || r === "bad_response") {
    return {
      retryable: true,
      reply: `${tried}, but the AI team's design came back in a form I couldn't use. ${safe} Press Retry to ask for it again.`,
    };
  }
  if (r === "incomplete_site") {
    return {
      retryable: true,
      reply: `${tried}, but the design that came back left parts of your site unfinished, so I didn't apply it. ${safe} Press Retry to ask for a complete design.`,
    };
  }
  if (r === "rate_limited") {
    return {
      retryable: true,
      reply: `${tried}, but the AI team is rate limited at the moment. ${safe} Wait a minute, then press Retry.`,
    };
  }
  return {
    retryable: true,
    reply: `${tried}, but the AI team didn't answer. ${safe} Press Retry to run this change again.`,
  };
}

/** What the chat says when a plain question could not be answered. */
export const CONVERSATION_UNAVAILABLE_REPLY =
  "I couldn't get an answer from the AI team for that just now. Nothing on your website changed. Press Retry to ask again, or tell me exactly what to change and I'll plan it.";
