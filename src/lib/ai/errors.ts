/**
 * The single error type every Revora AI call throws.
 *
 * It carries an HTTP-like status so callers can decide between "retry", "use
 * the deterministic Revora builder instead" and "tell the owner". Nothing here
 * is provider-specific: an adapter maps its provider's failure onto one of
 * these categories, so the rest of Revora never branches on a provider name.
 */

export type AiErrorCategory =
  | "not_configured"
  | "zero_cost_mode"
  | "invalid_request"
  | "unauthorized"
  | "rate_limited"
  | "quota"
  | "policy"
  | "too_large"
  | "timeout"
  | "provider_unavailable"
  | "bad_response"
  | "free_unavailable";

/** Categories where sending the same request again can succeed. */
const RETRYABLE: AiErrorCategory[] = ["rate_limited", "timeout", "provider_unavailable"];

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

export function categoryForStatus(status: number): AiErrorCategory {
  if (status === 400 || status === 422) return "invalid_request";
  if (status === 401) return "unauthorized";
  if (status === 402) return "quota";
  if (status === 403) return "policy";
  if (status === 408) return "timeout";
  if (status === 413) return "too_large";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "provider_unavailable";
}

/** The one message shown when Revora has no AI provider of its own configured. */
export const AI_NOT_CONFIGURED_MESSAGE =
  "Revora AI is not configured. Add a Revora-controlled AI provider.";

export function notConfigured() {
  return new RevoraAiError(503, AI_NOT_CONFIGURED_MESSAGE, { category: "not_configured" });
}

/**
 * Zero-cost mode is Revora's default architecture: the native engine builds
 * websites, and no external model is ever called on a customer's behalf. This
 * error exists so an optional enhancement path fails closed, loudly, on the
 * server — it is never shown to a customer, because the native engine answers
 * the request instead.
 */
export const AI_ZERO_COST_MESSAGE =
  "External AI is disabled (ZERO_AI_COST_MODE). Revora's native engine handles this request.";

export function zeroCostBlocked(provider?: string) {
  return new RevoraAiError(503, AI_ZERO_COST_MESSAGE, {
    category: "zero_cost_mode",
    provider: provider ?? null,
  });
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
 * FREE-AI-FIRST message. Shown when a request needed a generative model and no
 * free provider could serve it. It is deliberately non-blocking: Revora's own
 * deterministic engine still does the work, so this explains a reduced
 * capability rather than a failure.
 */
export const AI_FREE_UNAVAILABLE_MESSAGE =
  "No free AI provider is available right now, so Revora is completing this from your own business details. Nothing is blocked and no paid AI is required.";

export function freeAiUnavailable(detail?: string) {
  return new RevoraAiError(503, AI_FREE_UNAVAILABLE_MESSAGE, {
    category: "free_unavailable",
    detail: detail ?? null,
  });
}
