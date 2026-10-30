/**
 * The single error type every Revora AI call throws.
 *
 * It carries an HTTP-like status so callers can decide between a bounded retry,
 * pausing work and telling the owner. Nothing here
 * is provider-specific: an adapter maps its provider's failure onto one of
 * these categories, so the rest of Revora never branches on a provider name.
 */

export type AiErrorCategory =
  | "not_configured"
  | "invalid_request"
  | "unauthorized"
  | "rate_limited"
  | "quota"
  | "policy"
  | "too_large"
  | "timeout"
  | "workspace_cooldown"
  | "provider_unavailable"
  | "bad_response"
  | "free_unavailable"
  /** The build that asked was stopped (cancelled or superseded); no more AI work is started for it. */
  | "cancelled";

/** Categories where sending the same request again can succeed. */
const RETRYABLE: AiErrorCategory[] = ["rate_limited", "timeout", "provider_unavailable", "workspace_cooldown"];

export class RevoraAiError extends Error {
  status: number;
  category: AiErrorCategory;
  retryAfterSeconds: number | null;
  provider: string | null;
  /** Short, non-sensitive provider diagnostic kept for server logs only. */
  detail: string | null;

  constructor(
    status: number,
    message: string,
    options: {
      category?: AiErrorCategory;
      retryAfterSeconds?: number | null;
      provider?: string | null;
      detail?: string | null;
    } = {},
  ) {
    super(message);
    this.name = "RevoraAiError";
    this.status = status;
    this.category = options.category ?? categoryForStatus(status);
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    this.provider = options.provider ?? null;
    this.detail = options.detail ?? null;
  }

  get retryable() {
    return RETRYABLE.includes(this.category);
  }
}

/**
 * Statuses a proxy in front of the model answers with when the model did not
 * finish inside the proxy's own limit (504 gateway timeout, Cloudflare's 522
 * connection timed out and 524 "origin took too long", about two minutes). The
 * model was alive but too slow for this request, so they are timeouts, not
 * outages: sending the identical request to the same model hits the same wall.
 */
export const GATEWAY_TIMEOUT_STATUSES: readonly number[] = [504, 522, 524];

export function categoryForStatus(status: number): AiErrorCategory {
  if (status === 400 || status === 422) return "invalid_request";
  if (status === 401) return "unauthorized";
  if (status === 402) return "quota";
  if (status === 403) return "policy";
  if (status === 408) return "timeout";
  if (status === 413) return "too_large";
  if (status === 429) return "rate_limited";
  if (GATEWAY_TIMEOUT_STATUSES.includes(status)) return "timeout";
  if (status >= 500) return "provider_unavailable";
  return "provider_unavailable";
}

/** The one message shown when Revora has no AI provider of its own configured. */
export const AI_NOT_CONFIGURED_MESSAGE =
  "Revora AI is not configured. Add a Revora-controlled AI provider.";

export function notConfigured() {
  return new RevoraAiError(503, AI_NOT_CONFIGURED_MESSAGE, { category: "not_configured" });
}

/** Truthful message for a provider that is configured but not answering. */
export function providerUnavailable(provider: string, detail?: string) {
  return new RevoraAiError(
    503,
    `Revora's AI provider (${provider}) is temporarily unavailable. ${detail ?? "Try again shortly."}`.trim(),
    { category: "provider_unavailable", provider },
  );
}

/**
 * Every paid candidate was skipped before a request left because the daily
 * paid ledger refused it. A used-up cap is "quota" (not retryable until the
 * reset, so builds park instead of hammering); an unreadable ledger fails
 * closed and is worth retrying shortly.
 */
export function paidBudgetRefused(
  reason: "free_only" | "cap_zero" | "cap_reached" | "ledger_unavailable",
  capUsd: number,
  secondsUntilReset: number,
) {
  if (reason === "cap_reached")
    return new RevoraAiError(
      402,
      `Today's AI budget ($${capUsd.toFixed(2)}) is used up, so nothing was generated. It resets at midnight UTC (8 PM New York time in summer), and waiting work resumes then.`,
      { category: "quota", provider: "lovable", retryAfterSeconds: secondsUntilReset, detail: "paid_daily_cap_reached" },
    );
  if (reason === "ledger_unavailable")
    return new RevoraAiError(
      503,
      "Revora couldn't check today's AI budget, so no paid AI call was made. Try again in a few minutes.",
      { category: "provider_unavailable", provider: "lovable", retryAfterSeconds: 60, detail: "paid_ledger_unavailable" },
    );
  return new RevoraAiError(
    503,
    reason === "cap_zero"
      ? "Paid AI is switched off (AI_PAID_DAILY_CAP_USD is 0), so nothing was generated."
      : AI_FREE_UNAVAILABLE_MESSAGE,
    { category: "free_unavailable", provider: "lovable", detail: reason },
  );
}

/**
 * Shown when a request needed a generative model and no free provider could
 * serve it. Creative callers fail closed rather than substituting built-in work.
 */
export const AI_FREE_UNAVAILABLE_MESSAGE =
  "No AI provider is available for this request right now. Nothing was generated; please try again later.";

export function freeAiUnavailable(detail?: string) {
  return new RevoraAiError(503, AI_FREE_UNAVAILABLE_MESSAGE, {
    category: "free_unavailable",
    detail: detail ?? null,
  });
}

/** Raised instead of starting AI work for a build that has been stopped. Never retried, never billed. */
export function buildStopped() {
  return new RevoraAiError(499, "This build was stopped, so no more AI work was started for it.", { category: "cancelled" });
}
