/**
 * DOCUMENTED DEPENDENCY SECURITY EXCEPTIONS
 * =========================================
 *
 * Some advisories come through a framework's own dependency tree and cannot be
 * resolved from this repository. Those are never silently suppressed: they are
 * written down with an advisory id, the exact package path, why it is or is not
 * reachable in production, what compensates for it, the upstream constraint, an
 * owner and a review date.
 *
 * The security gate reports two DIFFERENT outcomes:
 *   - resolved  — the lockfile no longer contains a vulnerable version
 *   - exception — accepted, documented, upstream-blocked
 *
 * Pure module: no I/O, so the shape can be asserted in tests.
 */

export type ReachabilityState =
  | "runtime_reachable"
  | "build_time_only"
  | "dev_only"
  | "unreachable";

export type DependencyException = {
  /** Advisory identifier, e.g. a CVE or the registry advisory title. */
  advisory: string;
  /** The vulnerable package itself. */
  package: string;
  /** Full dependency path, e.g. "@tanstack/react-start > xmlbuilder2 > js-yaml". */
  path: string;
  installedVersion: string;
  /** First non-vulnerable version of the vulnerable package. */
  fixedIn: string;
  severity: "low" | "moderate" | "high" | "critical";
  reachability: ReachabilityState;
  /** Honest, evidence-backed explanation of exploitability in this product. */
  exploitability: string;
  compensatingControls: string[];
  /** Why it cannot be fixed here (e.g. framework pins the vulnerable range). */
  upstreamConstraint: string;
  owner: string;
  /** ISO date (YYYY-MM-DD) by which this exception must be re-reviewed. */
  reviewBy: string;
};

export type ExceptionFile = { exceptions: DependencyException[] };

const SEVERITIES = new Set(["low", "moderate", "high", "critical"]);
const REACHABILITY = new Set([
  "runtime_reachable",
  "build_time_only",
  "dev_only",
  "unreachable",
]);

const REQUIRED_TEXT = [
  "advisory",
  "package",
  "path",
  "installedVersion",
  "fixedIn",
  "exploitability",
  "upstreamConstraint",
  "owner",
] as const;

/**
 * Validates the exception registry. Returns the problems found; an empty array
 * means every documented exception is complete and in date.
 *
 * `today` is injected so the review-date rule is testable.
 */
export function validateExceptions(input: unknown, today: string): string[] {
  const problems: string[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input))
    return ["Exception registry must be an object with an `exceptions` array."];
  const raw = (input as { exceptions?: unknown }).exceptions;
  if (!Array.isArray(raw)) return ["Exception registry must contain an `exceptions` array."];

  raw.forEach((entry, index) => {
    const at = `exceptions[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      problems.push(`${at} must be an object.`);
      return;
    }
    const row = entry as Record<string, unknown>;
    for (const field of REQUIRED_TEXT) {
      const value = row[field];
      if (typeof value !== "string" || value.trim().length === 0)
        problems.push(`${at}.${field} is required.`);
    }
    if (!SEVERITIES.has(String(row["severity"])))
      problems.push(`${at}.severity must be low, moderate, high or critical.`);
    if (!REACHABILITY.has(String(row["reachability"])))
      problems.push(
        `${at}.reachability must be runtime_reachable, build_time_only, dev_only or unreachable.`,
      );
    const controls = row["compensatingControls"];
    if (!Array.isArray(controls) || controls.length === 0)
      problems.push(`${at}.compensatingControls must list at least one control.`);
    const reviewBy = String(row["reviewBy"] ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewBy)) problems.push(`${at}.reviewBy must be YYYY-MM-DD.`);
    else if (reviewBy < today)
      problems.push(`${at} (${String(row["advisory"])}) is overdue for review since ${reviewBy}.`);
  });

  return problems;
}

export type ExceptionSummary = {
  total: number;
  runtimeReachable: number;
  /** Exceptions whose review date has passed. */
  overdue: string[];
};

export function summariseExceptions(
  file: ExceptionFile,
  today: string,
): ExceptionSummary {
  return {
    total: file.exceptions.length,
    runtimeReachable: file.exceptions.filter((x) => x.reachability === "runtime_reachable").length,
    overdue: file.exceptions.filter((x) => x.reviewBy < today).map((x) => x.advisory),
  };
}
