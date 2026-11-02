/**
 * How one failed AI call is handled, in one pure place.
 *
 * Every failure is put in one error class, and the class decides what happens
 * next:
 *   transient    5xx, network errors, timeouts, a workspace cooldown. Worth a
 *                bounded retry with capped exponential backoff and jitter
 *                (a timeout moves to the next model instead: the same model
 *                with the same request hits the same wall).
 *   rate_limited 429. Retried the same way, but a Retry-After longer than the
 *                in-call cap is not waited out here: the next model answers.
 *   credits      402 / "out of credits" / spending cap. Never retried: the
 *                provider is skipped, and later calls in this process are
 *                refused before a request leaves (see creditCooldown below).
 *   client       Other 4xx (bad request, rejected key, policy, too large,
 *                retired model). The same request fails the same way, so it
 *                is never retried against the same model.
 *   cancelled    The build was stopped. Nothing else is tried.
 *
 * Pure and dependency-free (types only), so the router, the builder and the
 * tests share it.
 */
import type { AiErrorCategory } from "@/lib/ai/errors";

export type AiErrorClass = "transient" | "rate_limited" | "credits" | "client" | "cancelled";

/** What the router does after a failed attempt. */
export type AiRetryAction = "retry" | "next_model" | "skip_provider" | "stop";

/** Hard ceiling on attempts per model, whatever AI_MAX_ATTEMPTS_PER_PROVIDER says. */
export const AI_MAX_ATTEMPTS_CEILING = 4;
/** First retry waits about this long (before jitter). */
export const AI_RETRY_BASE_MS = 500;
/** No single in-call wait is longer than this; longer waits move to the next model. */
export const AI_RETRY_CAP_MS = 10_000;

export function classifyAiError(error: { category: AiErrorCategory; status?: number | null }): AiErrorClass {
  switch (error.category) {
    case "cancelled":
      return "cancelled";
    case "quota":
      return "credits";
    case "rate_limited":
      return "rate_limited";
    case "provider_unavailable": {
      // A 4xx the status map didn't name (404, 405, 409...) is still the
      // client's request, not a passing outage. Network errors carry 5xx/0.
      const status = error.status ?? 0;
      return status >= 400 && status < 500 ? "client" : "transient";
    }
    case "timeout":
    case "workspace_cooldown":
      return "transient";
    default:
      return "client";
  }
}

/** The configured attempts per model, clamped to 1..AI_MAX_ATTEMPTS_CEILING. */
export function clampAttempts(configured: number): number {
  if (!Number.isFinite(configured)) return 1;
  return Math.max(1, Math.min(AI_MAX_ATTEMPTS_CEILING, Math.floor(configured)));
}

/**
 * Capped exponential backoff with equal jitter: half of the exponential step
 * is fixed, the other half random, so concurrent retries spread out but never
 * retry instantly. A Retry-After is a minimum. Returns null when the wait
 * would be longer than the cap (the caller should not wait in-call).
 */
export function aiRetryDelayMs(
  attempt: number,
  options: { retryAfterSeconds?: number | null; random?: number; baseMs?: number; capMs?: number } = {},
): number | null {
  const base = options.baseMs ?? AI_RETRY_BASE_MS;
  const cap = options.capMs ?? AI_RETRY_CAP_MS;
  const random = Number.isFinite(options.random) ? Math.max(0, Math.min(1, options.random as number)) : Math.random();
  const step = Math.min(cap, base * 2 ** Math.max(0, Math.min(attempt - 1, 20)));
  const jittered = Math.round(step / 2 + random * (step / 2));
  const after = options.retryAfterSeconds;
  const requested = typeof after === "number" && Number.isFinite(after) && after > 0 ? Math.ceil(after * 1000) : 0;
  if (requested > cap) return null;
  return Math.min(cap, Math.max(jittered, requested));
}

export type AiRetryDecision = { errorClass: AiErrorClass; action: AiRetryAction; delayMs: number | null };

/**
 * The default decision for one failed attempt. The router keeps its own
 * special handling for too-large and malformed requests on top of this.
 * `remainingMs` is what is left of the call's wall-clock budget.
 */
export function aiRetryDecision(
  error: { category: AiErrorCategory; status?: number | null; retryAfterSeconds?: number | null },
  attempt: number,
  maxAttempts: number,
  options: { random?: number; remainingMs?: number } = {},
): AiRetryDecision {
  const errorClass = classifyAiError(error);
  if (errorClass === "cancelled") return { errorClass, action: "stop", delayMs: null };
  if (errorClass === "credits" || error.category === "unauthorized") return { errorClass, action: "skip_provider", delayMs: null };
  if (errorClass === "client") return { errorClass, action: "next_model", delayMs: null };
  // A model that used its whole time budget will do the same again.
  if (error.category === "timeout") return { errorClass, action: "next_model", delayMs: null };
  if (attempt >= clampAttempts(maxAttempts)) return { errorClass, action: "next_model", delayMs: null };
  const delayMs = aiRetryDelayMs(attempt, {
    retryAfterSeconds: error.retryAfterSeconds ?? null,
    ...(options.random !== undefined ? { random: options.random } : {}),
  });
  if (delayMs === null) return { errorClass, action: "next_model", delayMs: null };
  if (typeof options.remainingMs === "number" && delayMs >= options.remainingMs) return { errorClass, action: "next_model", delayMs: null };
  return { errorClass, action: "retry", delayMs };
}

/**
 * Thinker (builder) skip reasons that no amount of immediate retrying fixes:
 * credits or a spending cap used up, a rejected or missing key, AI switched
 * off. Builder loops stop on these instead of asking again.
 */
const FINAL_THINKER_REASONS = new Set([
  "credits_exhausted",
  "budget_exhausted",
  "unauthorized",
  "no_key",
  "disabled",
  "free_only",
  "no_tier_available",
]);

export function thinkerFailureRetryable(reason: string | null | undefined): boolean {
  return !FINAL_THINKER_REASONS.has(reason ?? "");
}

/** Fields of one structured AI failure log line. No prompt, answer, key or provider body. */
export type AiCallFailureLog = {
  requestId: string;
  task: string;
  provider: string;
  model: string;
  status: number;
  category: AiErrorCategory;
  errorClass: AiErrorClass;
  attempt: number;
  maxAttempts: number;
  action: AiRetryAction;
  retryInMs: number | null;
  latencyMs: number;
  fallbackUsed: boolean;
  /** False when the call was refused before a request left (credit cooldown). */
  sent: boolean;
};

/** The JSON line written for one failed AI call (whitelisted fields only). */
export function aiCallFailureLine(fields: AiCallFailureLog): string {
  const line = {
    event: "ai_call_failed",
    requestId: fields.requestId,
    task: String(fields.task).slice(0, 60),
    provider: fields.provider,
    model: String(fields.model).slice(0, 80),
    status: fields.status,
    category: fields.category,
    errorClass: fields.errorClass,
    attempt: fields.attempt,
    maxAttempts: fields.maxAttempts,
    action: fields.action,
    retryInMs: fields.retryInMs,
    latencyMs: Math.round(fields.latencyMs),
    fallbackUsed: fields.fallbackUsed,
    sent: fields.sent,
  };
  return `[ai-call] ${JSON.stringify(line)}`;
}

export function logAiCallFailure(fields: AiCallFailureLog): void {
  const line = aiCallFailureLine(fields);
  if (fields.errorClass === "credits" || fields.errorClass === "client") console.error(line);
  else console.warn(line);
}
