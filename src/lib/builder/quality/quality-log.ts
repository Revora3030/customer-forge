/**
 * QP-6 · Learning loop: the quality log.
 *
 * Storage choice: a Supabase table, `builder_quality_log` (migration 20261031180000), with RLS so only workspace
 * owners/admins and super admins can read it and only the service role can write. The writer here is defensive: if the
 * migration has not been applied yet it does nothing and the build is unaffected.
 *
 * Everything except `recordQualityEvent` is pure.
 */
import type { GateAttempt, GateFailure } from "@/lib/builder/quality/quality-gate";

export type QualityEventKind = "gate_attempt" | "build_score" | "change_request";

export type QualityLogRow = {
  organization_id: string;
  trade_slug: string;
  blueprint_source: "trade" | "alias" | "archetype" | "generic" | null;
  event_kind: QualityEventKind;
  attempt: number;
  score: number | null;
  passed: boolean | null;
  failures: { check: string; code: string; severity: string; part: string | null }[];
  step_roles: Record<string, string> | null;
  change_request: string | null;
};

/** 100 minus 25 per blocking failure and 5 per warning, never below 0. */
export function qualityScore(failures: readonly Pick<GateFailure, "severity">[]): number {
  const blocks = failures.filter((f) => f.severity === "block").length;
  const warns = failures.length - blocks;
  return Math.max(0, Math.min(100, 100 - blocks * 25 - warns * 5));
}

const slugOf = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "unknown";

/** Strips contact details from an owner's change request before it is stored, and caps it. */
export function sanitizeChangeRequest(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email]")
    .replace(/(?<![\w$.])\+?\d[\d\s().-]{6,}\d(?![\w])/g, "[number]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

type Common = { organizationId: string; tradeSlug: string; blueprintSource?: QualityLogRow["blueprint_source"]; stepRoles?: Record<string, string> | null };

const compact = (failures: readonly GateFailure[]): QualityLogRow["failures"] =>
  failures.slice(0, 50).map((f) => ({ check: f.check, code: f.code, severity: f.severity, part: f.partId }));

export function gateAttemptRow(common: Common, attempt: GateAttempt, passed: boolean | null = null): QualityLogRow {
  return {
    organization_id: common.organizationId, trade_slug: slugOf(common.tradeSlug), blueprint_source: common.blueprintSource ?? null,
    event_kind: "gate_attempt", attempt: Math.min(10, Math.max(0, attempt.attempt)), score: qualityScore(attempt.failures), passed,
    failures: compact(attempt.failures), step_roles: common.stepRoles ?? null, change_request: null,
  };
}

export function buildScoreRow(common: Common, finalFailures: readonly GateFailure[], passed: boolean, attempts: number): QualityLogRow {
  return {
    organization_id: common.organizationId, trade_slug: slugOf(common.tradeSlug), blueprint_source: common.blueprintSource ?? null,
    event_kind: "build_score", attempt: Math.min(10, Math.max(0, attempts - 1)), score: qualityScore(finalFailures), passed,
    failures: compact(finalFailures), step_roles: common.stepRoles ?? null, change_request: null,
  };
}

export function changeRequestRow(common: Common, request: string): QualityLogRow {
  return {
    organization_id: common.organizationId, trade_slug: slugOf(common.tradeSlug), blueprint_source: common.blueprintSource ?? null,
    event_kind: "change_request", attempt: 0, score: null, passed: null, failures: [], step_roles: null,
    change_request: sanitizeChangeRequest(request) || null,
  };
}

export type TradeSummary = {
  trade: string;
  builds: number;
  avgScore: number | null;
  passRate: number | null;
  changeRequests: number;
  topFailures: { code: string; count: number }[];
};

/** Rolls rows up per trade so the weakest blueprints are visible. Worst average first. */
export function summarizeByTrade(rows: readonly Pick<QualityLogRow, "trade_slug" | "event_kind" | "score" | "passed" | "failures">[]): TradeSummary[] {
  const by = new Map<string, typeof rows[number][]>();
  for (const row of rows) by.set(row.trade_slug, [...(by.get(row.trade_slug) ?? []), row]);
  const out: TradeSummary[] = [];
  for (const [trade, list] of by) {
    const builds = list.filter((r) => r.event_kind === "build_score");
    const scored = builds.filter((r) => typeof r.score === "number");
    const counts = new Map<string, number>();
    for (const r of list.filter((x) => x.event_kind === "gate_attempt")) for (const f of r.failures) counts.set(f.code, (counts.get(f.code) ?? 0) + 1);
    out.push({
      trade, builds: builds.length,
      avgScore: scored.length ? Math.round(scored.reduce((s, r) => s + (r.score as number), 0) / scored.length) : null,
      passRate: builds.length ? builds.filter((r) => r.passed === true).length / builds.length : null,
      changeRequests: list.filter((r) => r.event_kind === "change_request").length,
      topFailures: [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([code, count]) => ({ code, count })),
    });
  }
  return out.sort((a, b) => (a.avgScore ?? 101) - (b.avgScore ?? 101) || a.trade.localeCompare(b.trade));
}

/** The minimal insert surface, so the writer takes any Supabase client without importing one. */
export type LogClient = { from: (table: "builder_quality_log") => { insert: (row: QualityLogRow) => PromiseLike<{ error: { message: string; code?: string } | null }> } };

/** Writes one row. Never throws and never blocks a build: a missing table or any error returns false. */
export async function recordQualityEvent(client: LogClient, row: QualityLogRow): Promise<boolean> {
  try {
    const { error } = await client.from("builder_quality_log").insert(row);
    return !error;
  } catch {
    return false;
  }
}
