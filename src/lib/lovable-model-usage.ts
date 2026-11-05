export type UsageRow = { model: string | null; task: string | null; ok: boolean | null; estimated_cost_usd: number | null };
export type ModelUsage = { model: string; calls: number; ok: number; failed: number; costUsd: number | null; jobs: string[] };

/** Groups recorded calls per model; roster models with no calls appear with zero. */
export function summarizeModelUsage(rows: UsageRow[], roster: string[]): ModelUsage[] {
  const byModel = new Map<string, ModelUsage & { costKnown: boolean; jobSet: Set<string> }>();
  const entry = (model: string) => {
    let found = byModel.get(model);
    if (!found) {
      found = { model, calls: 0, ok: 0, failed: 0, costUsd: null, jobs: [], costKnown: false, jobSet: new Set() };
      byModel.set(model, found);
    }
    return found;
  };
  for (const id of roster.map((m) => m.trim()).filter(Boolean)) entry(id);
  for (const row of rows) {
    if (!row.model) continue;
    const e = entry(row.model);
    e.calls += 1;
    if (row.ok) e.ok += 1;
    else e.failed += 1;
    if (typeof row.estimated_cost_usd === "number") {
      e.costUsd = (e.costUsd ?? 0) + row.estimated_cost_usd;
      e.costKnown = true;
    }
    if (row.task) e.jobSet.add(row.task.replace(/^builder-thinker\./, ""));
  }
  return [...byModel.values()]
    .map(({ costKnown: _c, jobSet, ...rest }) => ({ ...rest, jobs: [...jobSet].slice(0, 6) }))
    .sort((a, b) => b.calls - a.calls || a.model.localeCompare(b.model));
}

export type BuildJobRow = {
  id: string;
  organization_id: string;
  status: string | null;
  created_at?: string | null;
  started_at: string | null;
  completed_at: string | null;
};
export type BuildEventRow = { organization_id: string | null; created_at: string; ok: boolean | null; estimated_cost_usd: number | null };
export type BuildCost = {
  jobId: string;
  organizationId: string;
  status: string | null;
  /** Wall-clock seconds from start to finish (to now while it is still running); null if it never started. */
  durationSeconds: number | null;
  calls: number;
  failedCalls: number;
  /** Sum of recorded estimates; null when no call in the window recorded a cost. */
  costUsd: number | null;
};

/**
 * Time and cost per build. `ai_usage_events` carries no job id, so a build's
 * cost is the recorded calls its workspace made between the build's start and
 * finish. That is approximate when one workspace runs two builds at once.
 */
export function summarizeBuildCosts(jobs: BuildJobRow[], events: BuildEventRow[], now = Date.now()): BuildCost[] {
  return jobs.map((job) => {
    const start = job.started_at ? Date.parse(job.started_at) : NaN;
    const end = job.completed_at ? Date.parse(job.completed_at) : now;
    const started = Number.isFinite(start);
    let calls = 0;
    let failedCalls = 0;
    let cost: number | null = null;
    if (started) {
      for (const event of events) {
        if (event.organization_id !== job.organization_id) continue;
        const at = Date.parse(event.created_at);
        if (!Number.isFinite(at) || at < start || at > end) continue;
        calls += 1;
        if (event.ok === false) failedCalls += 1;
        if (typeof event.estimated_cost_usd === "number") cost = (cost ?? 0) + event.estimated_cost_usd;
      }
    }
    return {
      jobId: job.id,
      organizationId: job.organization_id,
      status: job.status,
      durationSeconds: started ? Math.max(0, Math.round((end - start) / 1000)) : null,
      calls,
      failedCalls,
      costUsd: cost,
    };
  });
}

/** "4 min 12 s" for a build duration; "—" when unknown. */
export function formatBuildDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return `${minutes} min ${rest} s`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
