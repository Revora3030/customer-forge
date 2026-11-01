import { afterEach, describe, expect, it, vi } from "vitest";
import { RevoraAiError } from "@/lib/ai/errors";
import {
  AI_MAX_ATTEMPTS_CEILING,
  AI_RETRY_CAP_MS,
  aiCallFailureLine,
  aiRetryDecision,
  aiRetryDelayMs,
  clampAttempts,
  classifyAiError,
  logAiCallFailure,
  thinkerFailureRetryable,
  type AiCallFailureLog,
} from "@/lib/ai/retry-policy";

const err = (status: number, options: ConstructorParameters<typeof RevoraAiError>[2] = {}) =>
  new RevoraAiError(status, "x", options);

describe("classifyAiError", () => {
  it("puts every status in one class", () => {
    expect(classifyAiError(err(402))).toBe("credits");
    expect(classifyAiError(err(429))).toBe("rate_limited");
    expect(classifyAiError(err(500))).toBe("transient");
    expect(classifyAiError(err(503))).toBe("transient");
    expect(classifyAiError(err(408))).toBe("transient");
    expect(classifyAiError(err(524))).toBe("transient");
    expect(classifyAiError(err(400))).toBe("client");
    expect(classifyAiError(err(401))).toBe("client");
    expect(classifyAiError(err(403))).toBe("client");
    expect(classifyAiError(err(413))).toBe("client");
    expect(classifyAiError(err(422))).toBe("client");
    expect(classifyAiError(err(499, { category: "cancelled" }))).toBe("cancelled");
    // "Out of credit" sent as 429 is classified as quota upstream (providers/shared.ts).
    expect(classifyAiError(err(429, { category: "quota" }))).toBe("credits");
    // A network error is reported as provider_unavailable.
    expect(classifyAiError(err(503, { category: "provider_unavailable" }))).toBe("transient");
  });
});

describe("aiRetryDelayMs", () => {
  it("grows exponentially, with equal jitter, capped", () => {
    expect(aiRetryDelayMs(1, { random: 0 })).toBe(250);
    expect(aiRetryDelayMs(1, { random: 1 })).toBe(500);
    expect(aiRetryDelayMs(2, { random: 0 })).toBe(500);
    expect(aiRetryDelayMs(3, { random: 1 })).toBe(2_000);
    expect(aiRetryDelayMs(30, { random: 1 })).toBe(AI_RETRY_CAP_MS);
    expect(aiRetryDelayMs(30, { random: 0 })).toBe(AI_RETRY_CAP_MS / 2);
  });

  it("never retries instantly, whatever the random draw", () => {
    for (const random of [0, 0.3, 0.7, 1, Number.NaN, -5, 9]) {
      const delay = aiRetryDelayMs(1, { random });
      expect(delay).toBeGreaterThanOrEqual(250);
      expect(delay).toBeLessThanOrEqual(500);
    }
  });

  it("treats Retry-After as a minimum, and refuses waits above the cap", () => {
    expect(aiRetryDelayMs(1, { retryAfterSeconds: 3, random: 0 })).toBe(3_000);
    expect(aiRetryDelayMs(1, { retryAfterSeconds: 0, random: 0 })).toBe(250);
    expect(aiRetryDelayMs(1, { retryAfterSeconds: 60, random: 0 })).toBeNull();
  });
});

describe("aiRetryDecision", () => {
  it("never retries credits: the provider is skipped", () => {
    expect(aiRetryDecision(err(402), 1, 3, { random: 0 })).toEqual({ errorClass: "credits", action: "skip_provider", delayMs: null });
  });

  it("never retries other 4xx against the same model", () => {
    for (const status of [400, 403, 404, 413, 422]) expect(aiRetryDecision(err(status), 1, 3).action).toBe("next_model");
    expect(aiRetryDecision(err(401), 1, 3).action).toBe("skip_provider");
  });

  it("moves a timeout to the next model instead of repeating it", () => {
    expect(aiRetryDecision(err(408), 1, 3).action).toBe("next_model");
  });

  it("retries 429 / 5xx / network with backoff, up to the attempt limit", () => {
    expect(aiRetryDecision(err(503), 1, 2, { random: 0 })).toEqual({ errorClass: "transient", action: "retry", delayMs: 250 });
    expect(aiRetryDecision(err(429), 1, 2, { random: 0 })).toEqual({ errorClass: "rate_limited", action: "retry", delayMs: 250 });
    expect(aiRetryDecision(err(503), 2, 2).action).toBe("next_model");
  });

  it("does not wait past the call's remaining budget", () => {
    expect(aiRetryDecision(err(503), 1, 3, { random: 1, remainingMs: 100 }).action).toBe("next_model");
  });

  it("does not sleep in-call on a long Retry-After", () => {
    expect(aiRetryDecision(err(429, { retryAfterSeconds: 120 }), 1, 3).action).toBe("next_model");
  });

  it("stops on a cancelled build", () => {
    expect(aiRetryDecision(err(499, { category: "cancelled" }), 1, 3).action).toBe("stop");
  });

  it("clamps a misconfigured attempt limit", () => {
    expect(clampAttempts(50)).toBe(AI_MAX_ATTEMPTS_CEILING);
    expect(clampAttempts(0)).toBe(1);
    expect(clampAttempts(Number.NaN)).toBe(1);
    expect(aiRetryDecision(err(503), AI_MAX_ATTEMPTS_CEILING, 50).action).toBe("next_model");
  });
});

describe("thinkerFailureRetryable", () => {
  it("stops builder loops on credits, caps and key problems only", () => {
    for (const reason of ["credits_exhausted", "budget_exhausted", "unauthorized", "no_key", "disabled", "free_only", "no_tier_available"])
      expect(thinkerFailureRetryable(reason)).toBe(false);
    for (const reason of ["rate_limited", "timeout", "provider_unavailable", "bad_response", "ledger_unavailable", null])
      expect(thinkerFailureRetryable(reason)).toBe(true);
  });
});

describe("structured failure log", () => {
  const fields: AiCallFailureLog = {
    requestId: "req-1", task: "builder-thinker.creative_direction", provider: "lovable", model: "openai/gpt-6.1-sol",
    status: 402, category: "quota", errorClass: "credits", attempt: 1, maxAttempts: 2, action: "skip_provider",
    retryInMs: null, latencyMs: 12.4, fallbackUsed: false, sent: true,
  };
  afterEach(() => vi.restoreAllMocks());

  it("writes one parseable JSON line with exactly the whitelisted fields", () => {
    const line = aiCallFailureLine(fields);
    expect(line.startsWith("[ai-call] ")).toBe(true);
    const parsed = JSON.parse(line.slice("[ai-call] ".length));
    expect(Object.keys(parsed).sort()).toEqual(
      ["action", "attempt", "category", "errorClass", "event", "fallbackUsed", "latencyMs", "maxAttempts", "model", "provider", "requestId", "retryInMs", "sent", "status", "task"].sort(),
    );
    expect(parsed).toMatchObject({ event: "ai_call_failed", status: 402, errorClass: "credits", attempt: 1, latencyMs: 12 });
  });

  it("never carries extra fields such as a provider body or prompt", () => {
    const leaky = { ...fields, detail: "sk-live-secret body", prompt: "the owner's brief" } as AiCallFailureLog;
    const line = aiCallFailureLine(leaky);
    expect(line).not.toContain("secret");
    expect(line).not.toContain("brief");
  });

  it("logs credits/client failures as errors and transient ones as warnings", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logAiCallFailure(fields);
    logAiCallFailure({ ...fields, status: 503, category: "provider_unavailable", errorClass: "transient", action: "retry", retryInMs: 300 });
    expect(error).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
