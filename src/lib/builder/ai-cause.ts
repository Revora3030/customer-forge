/**
 * WHY DID THE AI TEAM NOT ANSWER?
 *
 * The AI gateway tells us three different things that all used to read as one
 * vague "AI team is at capacity":
 *   402 (category "quota")        -> the AI credits / spending cap are used up.
 *                                    Waiting a few minutes cannot fix it.
 *   429 (category "rate_limited") -> too many requests right now. Waiting does fix it.
 *   timeouts                      -> the model was too slow. Trying again may work.
 *
 * Pure and dependency-free: used by the worker, the chat agent and tests.
 */

export type AiCause = "credits" | "rate_limited" | "timeout";

export type AiCallOutcome = {
  ok: boolean | null;
  error_category: string | null;
  created_at?: string | null;
};

/**
 * The most recent unresolved reason the AI calls of an attempt failed. A
 * failure followed by a later success is resolved and ignored. Credits win over
 * rate limits, and rate limits over timeouts, because each one needs a
 * different next step from the owner.
 */
export function aiCauseFromCalls(calls: readonly AiCallOutcome[]): AiCause | null {
  const ordered = [...calls].sort((a, b) => Date.parse(a.created_at ?? "") - Date.parse(b.created_at ?? "") || 0);
  let lastOkIndex = -1;
  ordered.forEach((call, index) => {
    if (call.ok === true) lastOkIndex = index;
  });
  const unresolved = ordered.slice(lastOkIndex + 1).filter((call) => call.ok === false);
  const seen = new Set(unresolved.map((call) => call.error_category));
  if (seen.has("quota")) return "credits";
  if (seen.has("rate_limited")) return "rate_limited";
  if (seen.has("timeout")) return "timeout";
  return null;
}

/** Plain owner-facing sentence for each cause (no internals, no secrets). */
export const AI_CAUSE_OWNER_MESSAGE: Record<AiCause, string> = {
  credits:
    "Revora's AI credits are used up, so the AI team can't work right now. Nothing was published and your current website is unchanged. This is on Revora's side, not yours, and retrying won't help until the credits are topped up. Your finished sections are kept.",
  rate_limited:
    "The AI service is busy and asked Revora to slow down (too many requests). Nothing was published and your current website is unchanged. Press Retry build in a few minutes; your finished sections are kept.",
  timeout:
    "The AI service was too slow to answer. Nothing was published and your current website is unchanged. Press Retry build; your finished sections are kept.",
};

/** The failure kind (see build-failure.ts) an AI cause is reported as. */
export function failureKindForAiCause(cause: AiCause): "credits" | "provider" {
  return cause === "credits" ? "credits" : "provider";
}

/** Counts per cause, for the owner-visible wait reason. */
export function describeAiPressure(calls: readonly AiCallOutcome[]): string | null {
  const failed = calls.filter((call) => call.ok === false);
  const count = (category: string) => failed.filter((call) => call.error_category === category).length;
  const parts: string[] = [];
  if (count("quota")) parts.push(`${count("quota")} hit the AI credit limit`);
  if (count("rate_limited")) parts.push(`${count("rate_limited")} were rate-limited`);
  if (count("timeout")) parts.push(`${count("timeout")} timed out`);
  return parts.length ? `${parts.join(", ")} (of ${calls.length} AI calls)` : null;
}

/**
 * What the website assistant tells the owner when the design team could not
 * answer, by the reason the AI call failed. Nothing changed in every case.
 * Returns null for any other reason (the caller keeps its generic wording).
 */
export function assistantUnavailableReply(reason: string): { reply: string; retryable: boolean } | null {
  if (reason === "credits_exhausted")
    return {
      reply:
        "I couldn't make this change because Revora's AI credits are used up, so I've left your website exactly as it is. This is on Revora's side and trying again won't help until the credits are topped up.",
      retryable: false,
    };
  if (reason === "rate_limited")
    return {
      reply:
        "I couldn't make this change because the AI service is getting too many requests right now (a rate limit), so I've left your website exactly as it is. Please try again in a few minutes.",
      retryable: true,
    };
  if (reason === "timeout")
    return {
      reply:
        "I couldn't make this change because the AI service was too slow to answer, so I've left your website exactly as it is. Please try again in a moment.",
      retryable: true,
    };
  return null;
}
