/**
 * JC-22 Institute model evidence board. Pure shaping of recorded rows only:
 * per model, the calls recorded in the window, how many succeeded, failures by
 * cause and the last success. A model that is configured but has no recorded
 * call in the window sits in its own list. Nothing here is estimated, and an
 * unreadable source is `null` ("unavailable"), never zero.
 */
import { classifyFailure, type FailureCause } from "./ai-city";

export const EVIDENCE_WINDOW_DAYS = 30;
/** The trace read stops at this many rows; a full read means older calls are not counted. */
export const EVIDENCE_ROW_LIMIT = 5000;

export type TraceInput = { model: string | null; provider?: string | null; ok: boolean | null; reason: string | null; created_at: string };
export type RegistryInput = { model: string; provider: string; display_name: string | null; retired: boolean };

export type ModelEvidenceRow = {
  model: string;
  provider: string | null;
  calls: number;
  ok: number;
  failed: number;
  failuresByCause: { cause: FailureCause; count: number }[];
  lastSuccessAt: string | null;
};

export type ModelEvidence = {
  windowDays: number;
  checkedAt: string;
  /** True when the trace read hit its row limit, so the oldest calls in the window may be missing. */
  capped: boolean;
  /** Models with at least one recorded call, most calls first. Null: trace unreadable. */
  used: ModelEvidenceRow[] | null;
  /** Registry models (not retired) with no recorded call in the rows read. Null: registry or trace unreadable. */
  neverUsed: { model: string; provider: string; label: string }[] | null;
  /** Recorded calls that carry no model name; counted, never attributed. */
  unattributed: number | null;
};

const key = (model: string) => model.trim().toLowerCase();

export function buildModelEvidence(input: {
  trace: readonly TraceInput[] | null;
  registry: readonly RegistryInput[] | null;
  checkedAt: string;
  limit?: number;
  windowDays?: number;
}): ModelEvidence {
  const windowDays = input.windowDays ?? EVIDENCE_WINDOW_DAYS;
  const limit = input.limit ?? EVIDENCE_ROW_LIMIT;
  const { trace, registry } = input;
  if (!trace) return { windowDays, checkedAt: input.checkedAt, capped: false, used: null, neverUsed: null, unattributed: null };

  type Acc = { model: string; provider: string | null; calls: number; ok: number; causes: Map<FailureCause, number>; last: string | null };
  const byModel = new Map<string, Acc>();
  let unattributed = 0;
  for (const row of trace) {
    const model = row.model?.trim();
    if (!model) { unattributed += 1; continue; }
    const acc = byModel.get(key(model)) ?? { model, provider: row.provider ?? null, calls: 0, ok: 0, causes: new Map(), last: null };
    acc.calls += 1;
    if (!acc.provider && row.provider) acc.provider = row.provider;
    if (row.ok === true) {
      acc.ok += 1;
      if (!acc.last || Date.parse(row.created_at) > Date.parse(acc.last)) acc.last = row.created_at;
    } else {
      const cause = classifyFailure(row.reason);
      acc.causes.set(cause, (acc.causes.get(cause) ?? 0) + 1);
    }
    byModel.set(key(model), acc);
  }
  const used: ModelEvidenceRow[] = [...byModel.values()]
    .map((a) => ({
      model: a.model,
      provider: a.provider,
      calls: a.calls,
      ok: a.ok,
      failed: a.calls - a.ok,
      failuresByCause: [...a.causes].map(([cause, count]) => ({ cause, count })).sort((x, y) => y.count - x.count || x.cause.localeCompare(y.cause)),
      lastSuccessAt: a.last,
    }))
    .sort((x, y) => y.calls - x.calls || x.model.localeCompare(y.model));

  const neverUsed = registry
    ? registry.filter((r) => !r.retired && !byModel.has(key(r.model))).map((r) => ({ model: r.model, provider: r.provider, label: r.display_name?.trim() || r.model })).sort((x, y) => x.model.localeCompare(y.model))
    : null;
  return { windowDays, checkedAt: input.checkedAt, capped: trace.length >= limit, used, neverUsed, unattributed };
}

/** "92% (11 of 12)". Only calls with a recorded outcome count; no calls means no rate. */
export function successLabel(row: Pick<ModelEvidenceRow, "calls" | "ok">): string {
  return row.calls ? `${Math.round((row.ok / row.calls) * 100)}% (${row.ok} of ${row.calls})` : "no calls";
}
