import { describe, expect, it } from "vitest";
import { compareVerification, MAX_AUTONOMOUS_ATTEMPTS, retestSummary } from "./qa-retest-loop";
import type { VerificationReport } from "@/lib/agent/verify";

const report = (score: number, critical: number, warnings: number): VerificationReport => ({
  score,
  critical,
  warnings,
  passed: 10,
  checks: [
    { label: "Headline", ok: critical === 0, severity: "critical", where: "Home" },
    { label: "SEO title", ok: warnings === 0, severity: "warning", where: "Home" },
  ],
  categories: {
    content: { passed: 2, failed: 0 },
    seo: { passed: warnings === 0 ? 2 : 1, failed: warnings === 0 ? 0 : 1 },
    accessibility: { passed: 2, failed: 0 },
    conversion: { passed: 2, failed: 0 },
    technical: { passed: 2, failed: 0 },
    security: { passed: 0, failed: 0 },
  },
  summary: "test",
});

describe("qa-retest-loop", () => {
  it("stops immediately on a clean verification", () => {
    const decision = compareVerification(report(80, 1, 2), report(100, 0, 0), 2);
    expect(decision.outcome).toBe("pass");
    expect(decision.shouldRetry).toBe(false);
    expect(decision.shouldRollback).toBe(false);
  });

  it("retries an improved but incomplete verification up to the hard limit", () => {
    const decision = compareVerification(report(70, 2, 2), report(82, 1, 1), 1);
    expect(decision.outcome).toBe("improved");
    expect(decision.shouldRetry).toBe(true);
    expect(decision.instruction).toContain("verified issues");

    const last = compareVerification(report(82, 1, 1), report(82, 1, 1), MAX_AUTONOMOUS_ATTEMPTS);
    expect(last.shouldRetry).toBe(false);
    expect(last.outcome).toBe("unchanged");
  });

  it("halts and requests rollback when verification regresses", () => {
    const decision = compareVerification(report(90, 0, 1), report(75, 1, 2), 2);
    expect(decision.outcome).toBe("regressed");
    expect(decision.shouldRollback).toBe(true);
    expect(decision.shouldRetry).toBe(false);
  });

  it("produces an explainable bounded summary", () => {
    const decision = compareVerification(report(70, 2, 1), report(80, 1, 1), 1);
    expect(retestSummary(decision)).toContain("attempt 1/3");
  });
});
