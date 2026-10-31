/**
 * Quality log for the video bar: scores and failures per trade.
 *
 * Storage: Supabase table `builder_quality_log` (migration 20261031190000), additive, RLS with super-admin read only and
 * service-role write. Everything except `recordQualityEvent` is pure. The writer never throws and never blocks a build
 * or a publish: if the migration has not been applied yet it does nothing.
 *
 * Rows hold only trade, numbers, criterion ids and section ids. No free text, no contact details, no business facts.
 */
import type { CriterionId } from "@/lib/builder/quality/video-score";
import type { GateAttempt, GateResult } from "@/lib/builder/quality/video-gate";

export type QualityEventKind = "gate_attempt" | "build_score" | "publish_check";
export type BlueprintSource = "trade" | "alias" | "archetype" | "generic";

export type QualityFailure = {
  criterion: string;
  /** 0 to 1 when known. */
  score: number | null;
  sections: string[];
};

export type QualityLogRow = {
  organization_id: string;
  trade_slug: string;
  blueprint_source: BlueprintSource | null;
  event_kind: QualityEventKind;
  attempt: number;
  score: number | null;
  bar: number | null;
  passed: boolean | null;
  capped: "invented_facts" | "no_lead_capture" | null;
  gate_mode: "enforce" | "warn" | "off" | null;
  failures: QualityFailure[];
  step_roles: Record<string, string[] | string> | null;
};

export type LogCommon = { organizationId: string; tradeSlug: string; blueprintSource?: string | null };

const SOURCES: readonly string[] = ["trade", "alias", "archetype", "generic"];
const slugOf = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "unknown";
const sourceOf = (value: string | null | undefined): BlueprintSource | null => (value && SOURCES.includes(value) ? (value as BlueprintSource) : null);
const clampAttempt = (n: number) => Math.min(10, Math.max(0, Math.trunc(n)));

function base(common: LogCommon) {
  return { organization_id: common.organizationId, trade_slug: slugOf(common.tradeSlug), blueprint_source: sourceOf(common.blueprintSource) };
}

/** One gate attempt: the score after that attempt and the criteria that were still failing. */
export function gateAttemptRow(common: LogCommon, attempt: GateAttempt, bar: number): QualityLogRow {
  return {
    ...base(common), event_kind: "gate_attempt", attempt: clampAttempt(attempt.attempt), score: attempt.score, bar, passed: attempt.passed,
    capped: attempt.capped, gate_mode: null,
    failures: attempt.failures.slice(0, 20).map((f) => ({ criterion: f.criterion, score: f.score, sections: f.sections.slice(0, 20) })),
    step_roles: { check: attempt.roles.check, regenerate: attempt.roles.regenerate },
  };
}

/** The finished build: the best version the gate produced and what it could not fix. */
export function buildScoreRow(common: LogCommon, result: GateResult): QualityLogRow {
  return {
    ...base(common), event_kind: "build_score", attempt: clampAttempt(result.retriesUsed), score: result.score, bar: result.bar, passed: result.passed,
    capped: result.final.capped, gate_mode: null,
    failures: result.needsHuman.slice(0, 20).map((f) => ({ criterion: f.criterion, score: f.score, sections: f.sections.slice(0, 20) })),
    step_roles: null,
  };
}

/** The server-side publish decision on a publish, go-live or live edit. */
export function publishCheckRow(
  common: LogCommon,
  check: { score: number; bar: number; passed: boolean; mode: "enforce" | "warn" | "off"; failures: readonly (CriterionId | string)[] },
): QualityLogRow {
  return {
    ...base(common), event_kind: "publish_check", attempt: 0, score: Math.round(check.score), bar: check.bar, passed: check.passed,
    capped: null, gate_mode: check.mode,
    failures: check.failures.slice(0, 20).map((criterion) => ({ criterion, score: null, sections: [] })), step_roles: null,
  };
}

export type TradeSummary = {
  trade: string;
  builds: number;
  avgScore: number | null;
  passRate: number | null;
  publishChecks: number;
  publishBlocked: number;
  topFailures: { criterion: string; count: number }[];
};

/** Rolls rows up per trade so the weakest blueprints and the most common failing criteria are visible. Worst average first. */
export function summarizeByTrade(rows: readonly Pick<QualityLogRow, "trade_slug" | "event_kind" | "score" | "passed" | "failures">[]): TradeSummary[] {
  const by = new Map<string, (typeof rows)[number][]>();
  for (const row of rows) by.set(row.trade_slug, [...(by.get(row.trade_slug) ?? []), row]);
  const out: TradeSummary[] = [];
  for (const [trade, list] of by) {
    const builds = list.filter((r) => r.event_kind === "build_score");
    const publishes = list.filter((r) => r.event_kind === "publish_check");
    const scored = [...builds, ...publishes].filter((r) => typeof r.score === "number");
    const outcomes = [...builds, ...publishes];
    const counts = new Map<string, number>();
    for (const r of list.filter((x) => x.event_kind !== "gate_attempt")) for (const f of r.failures) counts.set(f.criterion, (counts.get(f.criterion) ?? 0) + 1);
    out.push({
      trade, builds: builds.length,
      avgScore: scored.length ? Math.round(scored.reduce((s, r) => s + (r.score as number), 0) / scored.length) : null,
      passRate: outcomes.length ? outcomes.filter((r) => r.passed === true).length / outcomes.length : null,
      publishChecks: publishes.length,
      publishBlocked: publishes.filter((r) => r.passed === false).length,
      topFailures: [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([criterion, count]) => ({ criterion, count })),
    });
  }
  return out.sort((a, b) => (a.avgScore ?? 101) - (b.avgScore ?? 101) || a.trade.localeCompare(b.trade));
}

/** The minimal insert surface, so the writer takes any Supabase client without importing one. */
export type LogClient = { from: (table: "builder_quality_log") => { insert: (row: QualityLogRow) => PromiseLike<{ error: { message: string } | null }> } };

/** Writes one row. Never throws and never blocks a build or publish: a missing table or any error returns false. */
export async function recordQualityEvent(client: LogClient, row: QualityLogRow): Promise<boolean> {
  try {
    const { error } = await client.from("builder_quality_log").insert(row);
    return !error;
  } catch {
    return false;
  }
}

/** A `record` callback for `runVideoGate` that logs every attempt as it happens. */
export function gateRecorder(client: LogClient, common: LogCommon, bar: number): (attempt: GateAttempt) => Promise<void> {
  return async (attempt) => { await recordQualityEvent(client, gateAttemptRow(common, attempt, bar)); };
}
