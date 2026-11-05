/**
 * AI City real metrics (B15-1). Pure summaries of records read from the
 * database. A value that could not be read, or has no records, stays null and
 * renders "not measured yet": nothing here is estimated or filled in.
 */
export type JobOutcome = { status: string; failure_kind: string | null };
export type SpendRow = { actual_microcents: number | null; estimate_microcents: number; settled_at: string | null };

export type CityMetrics = {
  checkedAt: string;
  queuedBuilds: number | null;
  success: { rate: number; succeeded: number; failed: number; n: number; windowDays: number } | null;
  failuresByCause: { cause: string; count: number }[] | null;
  paidSpend: { settledUsd: number; openUsd: number; capUsd: number; day: string } | null;
};

export const NOT_MEASURED = "not measured yet";
const FINISHED_OK = new Set(["completed"]);
const FINISHED_BAD = new Set(["failed"]);

/** Success rate over finished builds only (completed vs failed); cancelled and running builds are not counted. */
export function buildSuccess(rows: JobOutcome[] | null, windowDays = 7): CityMetrics["success"] {
  if (!rows) return null;
  const succeeded = rows.filter(r => FINISHED_OK.has(r.status)).length;
  const failed = rows.filter(r => FINISHED_BAD.has(r.status)).length;
  const n = succeeded + failed;
  if (!n) return null;
  return { rate: succeeded / n, succeeded, failed, n, windowDays };
}

/** Failed builds grouped by the recorded failure_kind; a missing kind is "unrecorded", never guessed. */
export function failuresByCause(rows: JobOutcome[] | null): CityMetrics["failuresByCause"] {
  if (!rows) return null;
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!FINISHED_BAD.has(r.status)) continue;
    const cause = r.failure_kind?.trim() || "unrecorded";
    counts.set(cause, (counts.get(cause) ?? 0) + 1);
  }
  return [...counts].map(([cause, count]) => ({ cause, count })).sort((a, b) => b.count - a.count || a.cause.localeCompare(b.cause));
}

/** Today's paid spend: settled real cost, plus reservations still open (counted at their estimate). */
export function paidSpend(rows: SpendRow[] | null, capMicrocents: number, microcentsPerDollar: number, day: string): CityMetrics["paidSpend"] {
  if (!rows) return null;
  let settled = 0, open = 0;
  for (const r of rows) {
    if (r.settled_at) settled += r.actual_microcents ?? 0;
    else open += r.estimate_microcents;
  }
  return { settledUsd: settled / microcentsPerDollar, openUsd: open / microcentsPerDollar, capUsd: capMicrocents / microcentsPerDollar, day };
}

export function formatRate(s: CityMetrics["success"]): string {
  return s ? `${Math.round(s.rate * 1000) / 10}% (N=${s.n})` : NOT_MEASURED;
}
