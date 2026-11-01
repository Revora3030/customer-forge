import { describe, expect, it } from "vitest";
import {
  AI_CAUSE_OWNER_MESSAGE,
  aiCauseFromCalls,
  assistantUnavailableReply,
  describeAiPressure,
  failureKindForAiCause,
} from "./ai-cause";
import { NoProgressError, isStallMessage, runWithNoProgressGuard, createProgressWatch } from "./no-progress";
import { describeBuildFailure, tagFailureMessage } from "./build-failure";
import { capacityVerdict } from "../site-engine.worker.server";

const call = (ok: boolean, error_category: string | null, at: number) => ({
  ok,
  error_category,
  created_at: new Date(Date.UTC(2026, 9, 31, 12, 0, at)).toISOString(),
});

describe("aiCauseFromCalls", () => {
  it("tells credits (402) from a rate limit (429) from a timeout", () => {
    expect(aiCauseFromCalls([call(false, "quota", 1)])).toBe("credits");
    expect(aiCauseFromCalls([call(false, "rate_limited", 1)])).toBe("rate_limited");
    expect(aiCauseFromCalls([call(false, "timeout", 1)])).toBe("timeout");
    expect(aiCauseFromCalls([call(false, "invalid_request", 1)])).toBeNull();
  });
  it("credits win over rate limits when both happened", () => {
    expect(aiCauseFromCalls([call(false, "rate_limited", 1), call(false, "quota", 2)])).toBe("credits");
  });
  it("ignores a failure that a later success resolved", () => {
    expect(aiCauseFromCalls([call(false, "quota", 1), call(true, null, 2)])).toBeNull();
    expect(aiCauseFromCalls([call(true, null, 1), call(false, "rate_limited", 2)])).toBe("rate_limited");
  });
});

describe("owner wording", () => {
  it("never reads the same for credits and rate limits", () => {
    expect(AI_CAUSE_OWNER_MESSAGE.credits).toMatch(/credits/i);
    expect(AI_CAUSE_OWNER_MESSAGE.rate_limited).toMatch(/too many requests/i);
    expect(AI_CAUSE_OWNER_MESSAGE.credits).not.toEqual(AI_CAUSE_OWNER_MESSAGE.rate_limited);
  });
  it("maps causes to failure kinds", () => {
    expect(failureKindForAiCause("credits")).toBe("credits");
    expect(failureKindForAiCause("rate_limited")).toBe("provider");
    expect(failureKindForAiCause("timeout")).toBe("provider");
  });
  it("a build ended with a cause shows that cause, and every cause message is a stall message", () => {
    for (const cause of ["credits", "rate_limited", "timeout"] as const) {
      const error = new NoProgressError("layout", 1000, cause);
      expect(error.cause).toBe(cause);
      expect(isStallMessage(error.message)).toBe(true);
      const kind = failureKindForAiCause(cause);
      const failure = describeBuildFailure({ status: "failed", failure_kind: kind, error_message: tagFailureMessage(kind, error.message) });
      expect(failure?.message).toBe(AI_CAUSE_OWNER_MESSAGE[cause]);
      expect(failure?.canRetry).toBe(true);
    }
  });
  it("describes pressure with credits separate from rate limits", () => {
    expect(describeAiPressure([call(false, "quota", 1), call(false, "rate_limited", 2), call(true, null, 3)])).toBe(
      "1 hit the AI credit limit, 1 were rate-limited (of 3 AI calls)",
    );
    expect(describeAiPressure([call(true, null, 1)])).toBeNull();
  });
});

describe("the stall guard reports the cause its probe finds", () => {
  it("rejects with the credits cause", async () => {
    const watch = createProgressWatch(20, Date.now() - 1000);
    await expect(
      runWithNoProgressGuard(() => new Promise<never>(() => undefined), watch, { checkEveryMs: 5, onStall: async () => "credits" }),
    ).rejects.toMatchObject({ cause: "credits", busy: true, message: AI_CAUSE_OWNER_MESSAGE.credits });
  });
});

describe("assistant reply", () => {
  it("distinguishes credits (no point retrying) from rate limit and timeout (retry)", () => {
    expect(assistantUnavailableReply("credits_exhausted")).toMatchObject({ retryable: false });
    expect(assistantUnavailableReply("credits_exhausted")?.reply).toMatch(/credits/i);
    expect(assistantUnavailableReply("rate_limited")).toMatchObject({ retryable: true });
    expect(assistantUnavailableReply("rate_limited")?.reply).toMatch(/too many requests/i);
    expect(assistantUnavailableReply("timeout")).toMatchObject({ retryable: true });
    expect(assistantUnavailableReply("unusable_answer")).toBeNull();
  });
});

describe("capacity wait summary", () => {
  it("names the credit limit when 402s are part of the pressure", () => {
    const calls = [
      ...Array.from({ length: 4 }, () => ({ ok: false, error_category: "quota" })),
      ...Array.from({ length: 2 }, () => ({ ok: false, error_category: "rate_limited" })),
    ];
    expect(capacityVerdict(calls, 0, Date.now())?.summary).toBe("4 hit the AI credit limit, 2 were rate-limited (of 6 AI calls)");
  });
});
