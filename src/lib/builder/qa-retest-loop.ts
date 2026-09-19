/**
 * REVORA VERIFY → REPAIR → RE-TEST LOOP
 * =====================================
 *
 * Pure orchestration policy for autonomous website runs.
 * It compares real verification reports, decides whether another bounded
 * attempt is justified, and creates a focused repair instruction from the
 * actual failed checks. It never performs database writes itself.
 */

import type { VerificationReport } from "@/lib/agent/verify";

export const MAX_AUTONOMOUS_ATTEMPTS = 3;

export type RetestOutcome = "pass" | "improved" | "regressed" | "unchanged" | "failed";

export type RetestDecision = {
  outcome: RetestOutcome;
  shouldRetry: boolean;
  shouldRollback: boolean;
  attempt: number;
  scoreDelta: number;
  criticalDelta: number;
  warningDelta: number;
  instruction: string | null;
};

function failureDetails(report: VerificationReport): string {
  return report.checks
    .filter((check) => !check.ok)
    .slice(0, 6)
    .map((check) => `${check.where}: ${check.label}${check.detail ? ` (${check.detail})` : ""}`)
    .join("; ");
}

export function compareVerification(
  before: VerificationReport | null,
  after: VerificationReport | null,
  attempt: number,
): RetestDecision {
  if (!after) {
    return {
      outcome: "failed",
      shouldRetry: attempt < MAX_AUTONOMOUS_ATTEMPTS,
      shouldRollback: false,
      attempt,
      scoreDelta: 0,
      criticalDelta: 0,
      warningDelta: 0,
      instruction:
        "Verification did not return a report. Do not assume the site is healthy; re-run the verification before making another change.",
    };
  }

  if (after.critical === 0 && after.warnings === 0) {
    return {
      outcome: "pass",
      shouldRetry: false,
      shouldRollback: false,
      attempt,
      scoreDelta: before ? after.score - before.score : 0,
      criticalDelta: before ? after.critical - before.critical : 0,
      warningDelta: before ? after.warnings - before.warnings : 0,
      instruction: null,
    };
  }

  const scoreDelta = before ? after.score - before.score : 0;
  const criticalDelta = before ? after.critical - before.critical : after.critical;
  const warningDelta = before ? after.warnings - before.warnings : after.warnings;

  if (before && (criticalDelta > 0 || scoreDelta < 0)) {
    return {
      outcome: "regressed",
      shouldRetry: false,
      shouldRollback: true,
      attempt,
      scoreDelta,
      criticalDelta,
      warningDelta,
      instruction: null,
    };
  }

  const improved = Boolean(before) && (criticalDelta < 0 || warningDelta < 0 || scoreDelta > 0);

  return {
    outcome: improved ? "improved" : "unchanged",
    shouldRetry: attempt < MAX_AUTONOMOUS_ATTEMPTS,
    shouldRollback: false,
    attempt,
    scoreDelta,
    criticalDelta,
    warningDelta,
    instruction: `The previous build was checked and still has these verified issues: ${failureDetails(after)}. Fix only those causes with safe, native website changes. Do not invent business facts. After changing the site, verify it again.`,
  };
}

export function retestSummary(decision: RetestDecision): string {
  const delta = decision.scoreDelta === 0 ? "no score change" : `${decision.scoreDelta > 0 ? "+" : ""}${decision.scoreDelta} score`;
  return `Verify → repair → re-test: attempt ${decision.attempt}/${MAX_AUTONOMOUS_ATTEMPTS}, ${decision.outcome}, ${delta}, ${decision.criticalDelta > 0 ? "+" : ""}${decision.criticalDelta} critical, ${decision.warningDelta > 0 ? "+" : ""}${decision.warningDelta} warnings.`;
}
