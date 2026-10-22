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
