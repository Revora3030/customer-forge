/**
 * Build / publish / picture health metrics for the admin monitoring view
 * (spec L). Pure aggregation over rows the server reads with the service role
 * after a super_admin check, so the numbers are unit tested.
 */
import { BUILD_FAILURE_KINDS, readFailureKind, type BuildFailureKind } from "@/lib/builder/build-failure";

export type JobRow = {
  status: string;
  failure_kind?: string | null;
  failed_stage?: string | null;
  error_message?: string | null;
  stage_timings?: Record<string, number> | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
};

export type BuildMetrics = {
  total: number;
  completed: number;
  failed: number;
  cancelled: number;
  active: number;
  successRate: number | null;
  medianBuildSeconds: number | null;
  p90BuildSeconds: number | null;
  failuresByKind: { kind: BuildFailureKind | "unknown"; count: number }[];
  failuresByStage: { stage: string; count: number }[];
  slowestStages: { stage: string; medianSeconds: number; samples: number }[];
};

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index]!;
}

export function summariseBuilds(rows: readonly JobRow[]): BuildMetrics {
  const completed = rows.filter((r) => r.status === "completed");
  const failed = rows.filter((r) => r.status === "failed");
  const cancelled = rows.filter((r) => r.status === "cancelled").length;
  const active = rows.filter((r) => r.status === "queued" || r.status === "processing").length;
  const finished = completed.length + failed.length;

  const durations = completed
    .map((r) => {
      const start = Date.parse(r.started_at ?? r.created_at);
      const end = Date.parse(r.completed_at ?? "");
      return Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) / 1000 : null;
    })
    .filter((v): v is number => v !== null);

  const kindCounts = new Map<BuildFailureKind | "unknown", number>();
  const stageCounts = new Map<string, number>();
  for (const row of failed) {
    const stored = row.failure_kind as BuildFailureKind | null | undefined;
    const kind =
      stored && (BUILD_FAILURE_KINDS as readonly string[]).includes(stored) ? stored : (readFailureKind(row.error_message) ?? "unknown");
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
    if (row.failed_stage) stageCounts.set(row.failed_stage, (stageCounts.get(row.failed_stage) ?? 0) + 1);
  }

  const stageSamples = new Map<string, number[]>();
  for (const row of rows) {
    for (const [stage, ms] of Object.entries(row.stage_timings ?? {})) {
      if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) continue;
      const list = stageSamples.get(stage) ?? [];
      list.push(ms / 1000);
      stageSamples.set(stage, list);
    }
  }

  const sortDesc = <T extends { count: number }>(list: T[]) => list.sort((a, b) => b.count - a.count);
  return {
    total: rows.length,
    completed: completed.length,
    failed: failed.length,
    cancelled,
    active,
    successRate: finished ? Math.round((completed.length / finished) * 1000) / 10 : null,
    medianBuildSeconds: percentile(durations, 50),
    p90BuildSeconds: percentile(durations, 90),
    failuresByKind: sortDesc([...kindCounts].map(([kind, count]) => ({ kind, count }))),
    failuresByStage: sortDesc([...stageCounts].map(([stage, count]) => ({ stage, count }))),
    slowestStages: [...stageSamples]
      .map(([stage, samples]) => ({ stage, medianSeconds: Math.round((percentile(samples, 50) ?? 0) * 10) / 10, samples: samples.length }))
      .sort((a, b) => b.medianSeconds - a.medianSeconds)
      .slice(0, 6),
  };
}

export type SmokeRow = { smoke_status: string };
export type ImageRow = { status: string; source: string };

export function summarisePublishes(rows: readonly SmokeRow[]) {
  const passed = rows.filter((r) => r.smoke_status === "passed").length;
  const failed = rows.filter((r) => r.smoke_status === "failed").length;
  return { total: rows.length, passed, failed, passRate: passed + failed ? Math.round((passed / (passed + failed)) * 1000) / 10 : null };
}

export function summariseImages(rows: readonly ImageRow[]) {
  const count = (status: string) => rows.filter((r) => r.status === status).length;
  return {
    total: rows.length,
    approved: count("approved"),
    pending: count("pending"),
    rejected: count("rejected"),
    failed: count("failed"),
  };
}

/** Alert conditions an operator must look at now. */
export function buildAlerts(m: BuildMetrics, publishes: ReturnType<typeof summarisePublishes>): string[] {
  const alerts: string[] = [];
  if (m.successRate !== null && m.completed + m.failed >= 5 && m.successRate < 80)
    alerts.push(`Build success rate is ${m.successRate}% over the last 7 days (target ≥ 80%).`);
  if (m.p90BuildSeconds !== null && m.p90BuildSeconds > 900)
    alerts.push(`Slowest 10% of builds take over ${Math.round(m.p90BuildSeconds / 60)} minutes.`);
  const provider = m.failuresByKind.find((f) => f.kind === "provider");
  if (provider && provider.count >= 3) alerts.push(`${provider.count} builds failed on AI provider errors — check provider health.`);
  if (publishes.failed > 0) alerts.push(`${publishes.failed} publish${publishes.failed === 1 ? "" : "es"} failed the live smoke check.`);
  return alerts;
}
