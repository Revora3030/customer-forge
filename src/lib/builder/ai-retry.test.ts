import { describe, expect, it, vi } from "vitest";
import {
  CONVERSATION_UNAVAILABLE_REPLY,
  RETRY_BACKOFF_MS,
  describeAiUnavailable,
  isRetryableAiReason,
  retryOnceOnTransient,
} from "./ai-retry";

const fail = (reason: string) => ({ ok: false as const, reason });
const ok = { ok: true as const };

describe("retryOnceOnTransient", () => {
  it("does not retry a success", async () => {
    const run = vi.fn().mockResolvedValue(ok);
    const { report } = await retryOnceOnTransient(run, { sleep: async () => {} });
    expect(run).toHaveBeenCalledTimes(1);
    expect(report).toEqual({ attempts: 1, retried: false, firstReason: null });
  });

  it("retries exactly once after the backoff when a transient failure comes back quickly", async () => {
    const run = vi.fn().mockResolvedValueOnce(fail("provider_unavailable")).mockResolvedValueOnce(ok);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const onRetry = vi.fn();
    const { result, report } = await retryOnceOnTransient(run, { sleep, onRetry });
    expect(result.ok).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(RETRY_BACKOFF_MS);
    expect(onRetry).toHaveBeenCalledWith("provider_unavailable");
    expect(report).toEqual({ attempts: 2, retried: true, firstReason: "provider_unavailable" });
  });

  it("never makes a third attempt", async () => {
    const run = vi.fn().mockResolvedValue(fail("rate_limited"));
    const { result, report } = await retryOnceOnTransient(run, { sleep: async () => {} });
    expect(run).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    expect(report.attempts).toBe(2);
  });

  it.each(["unauthorized", "no_key", "budget_exhausted", "review_rejected", "unusable_answer", "incomplete_site"])(
    "does not retry %s",
    async (reason) => {
      const run = vi.fn().mockResolvedValue(fail(reason));
      const { report } = await retryOnceOnTransient(run, { sleep: async () => {} });
      expect(run).toHaveBeenCalledTimes(1);
      expect(report.retried).toBe(false);
    },
  );

  it("does not retry a step that already ran for a long time", async () => {
    let clock = 0;
    const run = vi.fn().mockImplementation(async () => {
      clock += 120_000;
      return fail("provider_unavailable");
    });
    await retryOnceOnTransient(run, { sleep: async () => {}, now: () => clock });
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("describeAiUnavailable", () => {
  it("only claims a second try when one was made", () => {
    expect(describeAiUnavailable("provider_unavailable", { retried: true }).reply).toContain("I tried twice");
    expect(describeAiUnavailable("provider_unavailable", { retried: false }).reply).not.toContain("twice");
  });

  it("always says the site and draft are safe and what to do next", () => {
    for (const reason of ["provider_unavailable", "rate_limited", "bad_response", "review_unavailable", "unusable_answer", "budget_exhausted", "incomplete_site", "who_knows"]) {
      const copy = describeAiUnavailable(reason);
      expect(copy.reply).toMatch(/exactly as they were/);
      expect(copy.reply).toMatch(/Retry/);
      expect(copy.retryable).toBe(true);
    }
  });

  it("offers no Retry where it cannot help, and promises no human contact without an address", () => {
    const setup = describeAiUnavailable("unauthorized");
    expect(setup.retryable).toBe(false);
    expect(setup.reply).not.toMatch(/contact|support/i);
    expect(describeAiUnavailable("unauthorized", { supportEmail: "help@example.com" }).reply).toContain("help@example.com");
  });

  it("classifies retryable reasons", () => {
    expect(isRetryableAiReason("rate_limited")).toBe(true);
    expect(isRetryableAiReason("unauthorized")).toBe(false);
    expect(isRetryableAiReason(null)).toBe(false);
  });

  it("has a conversation message that is honest and has a next step", () => {
    expect(CONVERSATION_UNAVAILABLE_REPLY).toMatch(/Nothing on your website changed/);
    expect(CONVERSATION_UNAVAILABLE_REPLY).toMatch(/Retry/);
  });
});
