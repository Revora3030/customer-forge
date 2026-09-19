import type { VerificationReport } from "@/lib/agent/verify";

export const MAX_AUTONOMOUS_ATTEMPTS = 3;
export type RetestOutcome = "pass" | "improved" | "regressed" | "unchanged" | "failed";
export type RetestDecision = {
  outcome: RetestOutcome; shouldRetry: boolean; shouldRollback: boolean; attempt: number;
  scoreDelta: number; criticalDelta: number; warningDelta: number; instruction: string | null;
};

const details = (report: VerificationReport) => report.checks.filter((c) => !c.ok).slice(0, 6)
  .map((c) => `${c.where}: ${c.label}${c.detail ? ` (${c.detail})` : ""}`).join("; ");

export function compareVerification(before: VerificationReport | null, after: VerificationReport | null, attempt: number): RetestDecision {
  if (!after) return { outcome: "failed", shouldRetry: attempt < MAX_AUTONOMOUS_ATTEMPTS, shouldRollback: false, attempt, scoreDelta: 0, criticalDelta: 0, warningDelta: 0, instruction: "Verification returned no report; re-run verification before another change." };
  const criticalDelta = before ? after.critical - before.critical : after.critical;
  const warningDelta = before ? after.warnings - before.warnings : after.warnings;
  const scoreDelta = before ? after.score - before.score : 0;
  if (after.critical === 0 && after.warnings === 0) return { outcome: "pass", shouldRetry: false, shouldRollback: false, attempt, scoreDelta, criticalDelta, warningDelta, instruction: null };
  if (before && (criticalDelta > 0 || scoreDelta < 0)) return { outcome: "regressed", shouldRetry: false, shouldRollback: true, attempt, scoreDelta, criticalDelta, warningDelta, instruction: null };
  const improved = Boolean(before) && (criticalDelta < 0 || warningDelta < 0 || scoreDelta > 0);
  return {
    outcome: improved ? "improved" : "unchanged",
    shouldRetry: attempt < MAX_AUTONOMOUS_ATTEMPTS,
    shouldRollback: false, attempt, scoreDelta, criticalDelta, warningDelta,
    instruction: `The verified result still has these issues: ${details(after)}. Repair only those causes with safe native changes, then verify again.`,
  };
}

export function retestSummary(decision: RetestDecision) {
  return `Verify → repair → re-test: attempt ${decision.attempt}/${MAX_AUTONOMOUS_ATTEMPTS}, ${decision.outcome}, ${decision.scoreDelta >= 0 ? "+" : ""}${decision.scoreDelta} score.`;
}
