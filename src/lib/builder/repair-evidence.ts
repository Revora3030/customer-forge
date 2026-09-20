/**
 * EVIDENCE-GATED REPAIR DECISIONS
 * ===============================
 *
 * A repair is only worth keeping when measured evidence says the site got
 * better, or at least did not get worse. This module turns before/after QA
 * evidence into an explicit keep-or-roll-back decision, so the builder can
 * never claim a repair "worked" because the code merely changed.
 *
 * Nothing here guesses: when the evidence for either side is missing, the
 * decision is NOT_VERIFIED and the repair is rolled back rather than kept on
 * hope.
 */

export type EvidenceState = "PASS" | "FAIL" | "UNKNOWN" | "NOT_VERIFIED" | "BLOCKED";

export type RepairEvidence = {
  /** Blocking problems found by a real check (overflow, clipped text, broken image). */
  errors: number;
  /** Non-blocking problems (spacing, weak hierarchy, missing alt text). */
  warnings: number;
  /** Did the page actually render during the check? */
  rendered: boolean;
  /** Widths that were genuinely measured, e.g. [320, 768, 1280]. */
  widthsChecked?: number[];
};

export type RepairDecision = {
  decision: "keep" | "rollback";
  state: EvidenceState;
  /** Positive means the repair improved things. */
  delta: number;
  reason: string;
};

/** Errors weigh far more than warnings, so a repair can never trade one away for cosmetics. */
export function evidenceScore(evidence: RepairEvidence): number {
  const errors = Math.max(0, Math.round(evidence.errors));
  const warnings = Math.max(0, Math.round(evidence.warnings));
  return -(errors * 10 + warnings);
}

function measured(evidence: RepairEvidence | null | undefined): evidence is RepairEvidence {
  return !!evidence && evidence.rendered && (evidence.widthsChecked?.length ?? 0) > 0;
}

/**
 * Decides whether a bounded repair is kept. Keeps only when the after-evidence
 * is at least as good as before; anything unmeasured rolls back.
 */
export function decideRepair(
  before: RepairEvidence | null | undefined,
  after: RepairEvidence | null | undefined,
  options: { blocked?: boolean; blockedReason?: string } = {},
): RepairDecision {
  if (options.blocked) {
    return {
      decision: "rollback",
      state: "BLOCKED",
      delta: 0,
      reason: options.blockedReason?.trim() || "the repair could not be attempted",
    };
  }

  if (!measured(before) || !measured(after)) {
    return {
      decision: "rollback",
      state: "NOT_VERIFIED",
      delta: 0,
      reason: "no rendered before/after evidence was captured, so the repair was rolled back",
    };
  }

  const delta = evidenceScore(after) - evidenceScore(before);

  if (delta > 0) {
    return {
      decision: "keep",
      state: "PASS",
      delta,
      reason: `measured problems fell from ${before.errors} error(s)/${before.warnings} warning(s) to ${after.errors}/${after.warnings}`,
    };
  }

  if (delta === 0) {
    if (after.errors > 0) {
      return {
        decision: "rollback",
        state: "FAIL",
        delta,
        reason: `${after.errors} blocking problem(s) remained after the repair, so it was rolled back`,
      };
    }
    return {
      decision: "keep",
      state: "UNKNOWN",
      delta,
      reason: "the repair changed nothing measurable and left no problems behind",
    };
  }

  return {
    decision: "rollback",
    state: "FAIL",
    delta,
    reason: `the repair made things worse (${before.errors}/${before.warnings} became ${after.errors}/${after.warnings}), so it was rolled back`,
  };
}

/** One honest line per repair for the proof report. */
export function describeRepairDecision(label: string, decision: RepairDecision): string {
  const verb = decision.decision === "keep" ? "kept" : "rolled back";
  return `${label}: ${verb} [${decision.state}] — ${decision.reason}`;
}

/** Roll-up for the proof report; never reports a pass without kept, measured repairs. */
export function summariseRepairDecisions(decisions: RepairDecision[]): {
  kept: number;
  rolledBack: number;
  state: EvidenceState;
  line: string;
} {
  const kept = decisions.filter((entry) => entry.decision === "keep").length;
  const rolledBack = decisions.length - kept;
  const state: EvidenceState = !decisions.length
    ? "NOT_VERIFIED"
    : decisions.some((entry) => entry.state === "BLOCKED")
      ? "BLOCKED"
      : decisions.every((entry) => entry.state === "NOT_VERIFIED")
        ? "NOT_VERIFIED"
        : kept > 0
          ? "PASS"
          : "FAIL";
  const line = !decisions.length
    ? "Auto-repair: nothing was attempted, so nothing is verified."
    : `Auto-repair: ${kept} kept, ${rolledBack} rolled back after re-checking the rendered page [${state}].`;
  return { kept, rolledBack, state, line };
}
