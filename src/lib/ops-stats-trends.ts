/**
 * JC-52 stats trends: pure shaping only. Every point is a recorded count for
 * that UTC day-window. A series that could not be read stays null ("not
 * measured"), never a fabricated zero trend.
 */

export const TREND_KEYS = ["buildsOk", "buildsFailed", "leads", "trials", "approvalsWaited"] as const;
export type TrendKey = (typeof TREND_KEYS)[number];

export const TREND_LABELS: Record<TrendKey, string> = {
  buildsOk: "Builds completed",
  buildsFailed: "Builds failed",
  leads: "Leads",
  trials: "Trials started",
  approvalsWaited: "Approvals waited",
};

export type TrendSeries = {
  key: TrendKey;
  label: string;
  /** Daily counts, oldest first. null = the read failed. */
  days7: number[] | null;
  days30: number[] | null;
  /** Sum of the window; null when the series is unreadable. */
  n7: number | null;
  n30: number | null;
  /** True when the read hit the row cap, so N is a floor. */
  capped: boolean;
};

export type OpsStatsTrends = {
  checkedAt: string;
  series: TrendSeries[];
  /** Shared row cap applied to each source query. */
  rowLimit: number;
};

export const TREND_ROW_LIMIT = 10_000;

/** Rolling day buckets ending at `now`, oldest first. Only finite timestamps count. */
export function dailyBuckets(timestamps: readonly string[], now: number, days: number): number[] {
  const buckets = new Array<number>(Math.max(1, days)).fill(0);
  const width = buckets.length;
  for (const stamp of timestamps) {
    const at = Date.parse(stamp);
    if (!Number.isFinite(at) || at > now) continue;
    const back = Math.floor((now - at) / 86_400_000);
    if (back >= 0 && back < width) buckets[width - 1 - back] = (buckets[width - 1 - back] ?? 0) + 1;
  }
  return buckets;
}

export function sumBuckets(values: readonly number[] | null): number | null {
  if (!values) return null;
  return values.reduce((total, value) => total + value, 0);
}

/** Shape one series from recorded timestamps (or null when the source was unreadable). */
export function seriesFromTimestamps(
  key: TrendKey,
  timestamps: readonly string[] | null,
  now: number,
  capped = false,
): TrendSeries {
  if (!timestamps) {
    return { key, label: TREND_LABELS[key], days7: null, days30: null, n7: null, n30: null, capped: false };
  }
  const days30 = dailyBuckets(timestamps, now, 30);
  const days7 = days30.slice(-7);
  return {
    key,
    label: TREND_LABELS[key],
    days7,
    days30,
    n7: sumBuckets(days7),
    n30: sumBuckets(days30),
    capped,
  };
}

export function buildOpsStatsTrends(input: {
  buildsOk: readonly string[] | null;
  buildsFailed: readonly string[] | null;
  leads: readonly string[] | null;
  trials: readonly string[] | null;
  approvalsWaited: readonly string[] | null;
  caps?: Partial<Record<TrendKey, boolean>>;
  checkedAt: string;
  now: number;
  rowLimit?: number;
}): OpsStatsTrends {
  const caps = input.caps ?? {};
  return {
    checkedAt: input.checkedAt,
    rowLimit: input.rowLimit ?? TREND_ROW_LIMIT,
    series: TREND_KEYS.map((key) =>
      seriesFromTimestamps(key, input[key], input.now, Boolean(caps[key])),
    ),
  };
}

/** "12 (N=12)" or "not measured" when the series could not be read. */
export function trendTotalLabel(n: number | null, capped: boolean): string {
  if (n === null) return "not measured";
  return capped ? `${n}+ (N≥${n})` : `${n} (N=${n})`;
}
