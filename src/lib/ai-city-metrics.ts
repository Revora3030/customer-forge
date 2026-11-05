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

/** Share of the daily cap at which the gauge warns. Mirrors PAID_CAP_WARN_RATIO in the paid-budget guard. */
export const CAP_WARN_RATIO = 0.8;
/** The metrics reads stop at this many rows, so a window with this many builds is a floor, not a full count. */
export const METRICS_ROW_LIMIT = 10_000;

export type CapLevel = { level: "ok" | "warn" | "full"; share: number; label: string };

/**
 * Where today's paid AI spend sits against Revora's own daily cap. Settled cost
 * plus reservations still open counts, as the guard counts it. Returns null
 * when the spend or the cap is unknown (cap of zero means paid AI is off, which
 * is not "full").
 */
export function capLevel(s: CityMetrics["paidSpend"] | undefined): CapLevel | null {
  if (!s || !Number.isFinite(s.settledUsd) || !Number.isFinite(s.openUsd) || !Number.isFinite(s.capUsd) || s.capUsd <= 0) return null;
  const share = (s.settledUsd + s.openUsd) / s.capUsd;
  if (share >= 1) return { level: "full", share, label: "At the daily cap. New paid AI work pauses until midnight UTC." };
  if (share >= CAP_WARN_RATIO) return { level: "warn", share, label: `${Math.floor(share * 100)}% of the daily cap used. Paid AI work pauses at the cap.` };
  return { level: "ok", share, label: "" };
}

export type MetricKey = "queued" | "success" | "failures" | "spend";

/** Plain-language "how this is measured" for each stat. Uses only what was read: window, sample size, row limit. */
export function metricExplainer(key: MetricKey, m: CityMetrics | undefined): string {
  const days = m?.success?.windowDays ?? 7;
  const capped = m?.success && m.success.n >= METRICS_ROW_LIMIT ? ` Only the newest ${METRICS_ROW_LIMIT.toLocaleString("en-US")} finished builds are read, so this is a floor.` : "";
  switch (key) {
    case "queued":
      return "Builds waiting for a worker right now: generation jobs whose status is queued. A live count, not an average.";
    case "success":
      return `Finished builds (completed or failed) updated in the last ${days} days. Cancelled and still-running builds are left out. N is the number of finished builds counted.${capped}`;
    case "failures":
      return `Failed builds in the same ${days}-day window, grouped by the failure kind recorded on the job. A failure with no recorded kind shows as unrecorded; nothing is guessed.${capped}`;
    case "spend":
      return "Real cost of paid AI calls settled today (UTC day) plus calls still running, counted at their estimate, against Revora's own daily cap (AI_PAID_DAILY_CAP_USD). It is not the Lovable credit balance.";
  }
}
