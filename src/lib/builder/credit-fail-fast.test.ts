import { describe, expect, it } from "vitest";
import { classifyBuildFailure } from "@/lib/builder/build-failure";
import { RevoraAiError } from "@/lib/ai/errors";
import { creditsExhaustedForAttempt, creditsFailLine, DAILY_CAP_DETAIL } from "@/lib/builder/credit-fail-fast";

const t = (minute: number) => `2026-11-01T10:${String(minute).padStart(2, "0")}:00Z`;

describe("creditsExhaustedForAttempt", () => {
  it("a 402 that ended the attempt is credits", () => {
    const error = new RevoraAiError(402, "Revora's AI provider is out of credits right now.");
    const failure = classifyBuildFailure(error, 402);
    expect(creditsExhaustedForAttempt({ status: 402, failureKind: failure.kind, calls: [] })).toBe(true);
  });

  it("today's paid cap is not credits: it resets, so it keeps the wait path", () => {
    expect(creditsExhaustedForAttempt({ status: 402, failureKind: "credits", errorDetail: DAILY_CAP_DETAIL, calls: [] })).toBe(false);
  });

  it("an AI-step failure whose unresolved calls were 402s is credits", () => {
    const calls = [
      { ok: true, error_category: null, created_at: t(1) },
      { ok: false, error_category: "quota", created_at: t(2) },
      { ok: false, error_category: "quota", created_at: t(3) },
    ];
    expect(creditsExhaustedForAttempt({ status: 0, failureKind: "provider", calls })).toBe(true);
  });

  it("a 402 that a later call recovered from is not credits", () => {
    const calls = [
      { ok: false, error_category: "quota", created_at: t(1) },
      { ok: true, error_category: null, created_at: t(2) },
      { ok: false, error_category: "rate_limited", created_at: t(3) },
    ];
    expect(creditsExhaustedForAttempt({ status: 0, failureKind: "provider", calls })).toBe(false);
  });

  it("rate limits and timeouts are not credits (they keep the capacity wait)", () => {
    const calls = Array.from({ length: 6 }, (_, i) => ({ ok: false, error_category: i % 2 ? "rate_limited" : "timeout", created_at: t(i) }));
    expect(creditsExhaustedForAttempt({ status: 429, failureKind: "provider", calls })).toBe(false);
  });

  it("owner input problems are never relabelled", () => {
    expect(creditsExhaustedForAttempt({ status: 402, failureKind: "intake_validation", calls: [] })).toBe(false);
  });
});

describe("creditsFailLine", () => {
  it("is one JSON line with no message text", () => {
    const line = creditsFailLine({ jobId: "job-1", attempt: 2, source: "cutoff" });
    expect(JSON.parse(line.replace("[site-engine] ", ""))).toEqual({ event: "build_failed_credits", jobId: "job-1", attempt: 2, source: "cutoff" });
  });
});
