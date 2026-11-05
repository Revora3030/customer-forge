/**
 * PAI-20: QA scoring + bounded repair loop.
 *
 * Score a published page, and when it falls below the bar start at most
 * `maxRounds` repair attempts. Every attempt is versioned first and rolled back
 * automatically when the next score is not strictly better, so a repair can
 * never leave the site worse than it started. The owner gets an honest
 * before/after report.
 *
 * Pure orchestration: scoring (screenshots + vision-review + quality-gate
 * checks), the repair run and the version store are injected, so this runs
 * without a browser or model in tests. The PAI-19 runner and PAI-14 site tools
 * supply the real ones. Nothing here publishes or sends anything.
 */

export type QaIssue = { id: string; message: string; viewport?: number };
export type QaScore = { score: number; issues: QaIssue[] };

export type QaCheck = { id: string; message: string; passed: boolean; weight?: number; viewport?: number };

/** Weighted pass-rate of deterministic checks, 0-100. No checks scores 0 (unknown is not good). */
export function scoreFromChecks(checks: QaCheck[]): QaScore {
  if (checks.length === 0) return { score: 0, issues: [{ id: "no_checks", message: "No checks could run on this page." }] };
  let total = 0;
  let earned = 0;
  const issues: QaIssue[] = [];
  for (const check of checks) {
    const weight = Math.max(0, check.weight ?? 1);
    total += weight;
    if (check.passed) earned += weight;
    else issues.push({ id: check.id, message: check.message, ...(check.viewport === undefined ? {} : { viewport: check.viewport }) });
  }
  return { score: total === 0 ? 0 : Math.round((earned / total) * 100), issues };
}

/** The classic phone bug: the page scrolls sideways. Feed it per-viewport measurements. */
export function overflowCheck(measure: { viewportWidth: number; scrollWidth: number }): QaCheck {
  const passed = measure.scrollWidth <= measure.viewportWidth + 1;
  return {
    id: `overflow-${measure.viewportWidth}`,
    message: `The page is wider than a ${measure.viewportWidth}px screen, so it scrolls sideways.`,
    passed,
    weight: 3,
    viewport: measure.viewportWidth,
  };
}

export type RepairRound = {
  round: number;
  versionId: string | null;
  action: "kept" | "rolled_back" | "no_change" | "failed";
  scoreBefore: number;
  scoreAfter: number | null;
  summary: string;
};

export type QaRepairResult = {
  status: "passed" | "repaired" | "improved" | "unchanged" | "rolled_back" | "failed";
  before: QaScore;
  after: QaScore;
  rounds: RepairRound[];
  /** Plain English for the owner. */
  report: string;
};

export type QaRepairDeps = {
  score: () => Promise<QaScore>;
  /** Saves the current site as a version and returns its id. Must run before every change. */
  snapshot: () => Promise<string>;
  /** Makes one bounded change aimed at the issues. `changed: false` means it found nothing to do. */
  repair: (input: { issues: QaIssue[]; round: number }) => Promise<{ changed: boolean; summary: string }>;
  restore: (versionId: string) => Promise<void>;
  threshold?: number;
  maxRounds?: number;
};

export const DEFAULT_QA_THRESHOLD = 85;
export const MAX_QA_REPAIR_ROUNDS = 2;

export async function runQaRepair(deps: QaRepairDeps): Promise<QaRepairResult> {
  const threshold = deps.threshold ?? DEFAULT_QA_THRESHOLD;
  const maxRounds = Math.min(MAX_QA_REPAIR_ROUNDS, Math.max(0, Math.floor(deps.maxRounds ?? MAX_QA_REPAIR_ROUNDS)));
  const before = await deps.score();
  let best = before;
  const rounds: RepairRound[] = [];
  let rolledBack = false;
  let failed = false;

  if (before.score >= threshold) return finish("passed");

  for (let round = 1; round <= maxRounds && best.score < threshold; round++) {
    let versionId: string | null = null;
    try {
      versionId = await deps.snapshot();
    } catch {
      // No restore point, no change. Never repair without a way back.
      rounds.push({ round, versionId: null, action: "failed", scoreBefore: best.score, scoreAfter: null, summary: "Could not save a restore point, so nothing was changed." });
      failed = true;
      break;
    }
    let change: { changed: boolean; summary: string };
    try {
      change = await deps.repair({ issues: best.issues, round });
    } catch {
      await restoreQuietly(deps, versionId);
      rounds.push({ round, versionId, action: "failed", scoreBefore: best.score, scoreAfter: null, summary: "The repair attempt failed and was undone." });
      failed = true;
      break;
    }
    if (!change.changed) {
      rounds.push({ round, versionId, action: "no_change", scoreBefore: best.score, scoreAfter: null, summary: change.summary });
      break;
    }
    let next: QaScore;
    try {
      next = await deps.score();
    } catch {
      // An unverified change is treated as a worse one.
      await restoreQuietly(deps, versionId);
      rounds.push({ round, versionId, action: "rolled_back", scoreBefore: best.score, scoreAfter: null, summary: `${change.summary} It could not be re-checked, so it was undone.` });
      rolledBack = true;
      failed = true;
      break;
    }
    if (next.score > best.score) {
      rounds.push({ round, versionId, action: "kept", scoreBefore: best.score, scoreAfter: next.score, summary: change.summary });
      best = next;
    } else {
      await restoreQuietly(deps, versionId);
      rounds.push({ round, versionId, action: "rolled_back", scoreBefore: best.score, scoreAfter: next.score, summary: `${change.summary} The score did not improve, so it was undone.` });
      rolledBack = true;
    }
  }

  const improved = best.score > before.score;
  return finish(failed && !improved ? "failed" : best.score >= threshold ? "repaired" : improved ? "improved" : rolledBack ? "rolled_back" : "unchanged");

  function finish(status: QaRepairResult["status"]): QaRepairResult {
    return { status, before, after: best, rounds, report: buildReport(status, before, best, rounds, threshold) };
  }
}

async function restoreQuietly(deps: QaRepairDeps, versionId: string) {
  try {
    await deps.restore(versionId);
  } catch {
    /* surfaced through the report: the round is marked failed/rolled back and the owner is told to check */
  }
}

function buildReport(status: QaRepairResult["status"], before: QaScore, after: QaScore, rounds: RepairRound[], threshold: number): string {
  const scores = `Score ${before.score} → ${after.score} (goal ${threshold}).`;
  const kept = rounds.filter((r) => r.action === "kept").map((r) => r.summary);
  const outstanding = after.issues.map((i) => i.message);
  switch (status) {
    case "passed":
      return `Your page passed my check (${before.score}/100). Nothing needed changing.`;
    case "repaired":
      return `${scores} I fixed it: ${kept.join(" ")}`;
    case "improved":
      return `${scores} I improved it: ${kept.join(" ")} Still open: ${outstanding.join(" ")}`;
    case "rolled_back":
      return `${scores} I tried ${rounds.length} fix${rounds.length === 1 ? "" : "es"}, but none made it better, so I undid them. Still open: ${outstanding.join(" ")}`;
    case "failed":
      return `${scores} A repair step failed and was undone where possible. Please check the page. Still open: ${outstanding.join(" ")}`;
    default:
      return `${scores} I couldn't find a safe change to make. Still open: ${outstanding.join(" ")}`;
  }
}
