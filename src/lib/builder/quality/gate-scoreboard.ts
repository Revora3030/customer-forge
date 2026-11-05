/**
 * JC-21 quality-gate scoreboard, pure part.
 *
 * For each recent site, the latest recorded video-bar results from `builder_quality_log`:
 *  - `build_score` rows are the final `runVideoGate` result for a build;
 *  - `publish_check` rows are the server-side publish decision.
 * A site with no recorded row is NOT_VERIFIED. When the log itself cannot be read (for example the migration is not
 * applied yet) every site is NOT_VERIFIED and the board says the log is unavailable. Nothing is estimated: a score on
 * this board is always a number copied from a stored row.
 */
export const NOT_VERIFIED = "NOT_VERIFIED" as const;

export type ScoreRow = {
  organization_id: string;
  event_kind: string;
  score: number | null;
  bar: number | null;
  passed: boolean | null;
  gate_mode: string | null;
  failures: unknown;
  created_at: string;
};

export type RecentSite = { organizationId: string; name: string | null; lastBuildAt: string | null };

export type GateResult = { score: number; bar: number | null; passed: boolean | null; at: string; mode: string | null };

export type SiteVerdict = "passed" | "below_bar" | typeof NOT_VERIFIED;

export type SiteScore = {
  organizationId: string;
  name: string | null;
  lastBuildAt: string | null;
  build: GateResult | null;
  publish: GateResult | null;
  verdict: SiteVerdict;
  /** Criterion ids that were still failing on the newest scored row, as stored. */
  failing: string[];
  /** Number of scored rows read for this site (build + publish). */
  n: number;
};

export type GateScoreboard = {
  checkedAt: string;
  /** False when `builder_quality_log` could not be read. */
  logAvailable: boolean;
  /** False when the recent-site list could not be read. */
  sitesAvailable: boolean;
  sites: SiteScore[];
  /** Totals over sites with a measured verdict only. */
  measured: { passed: number; belowBar: number; notVerified: number };
};

const isScored = (r: ScoreRow): boolean =>
  (r.event_kind === "build_score" || r.event_kind === "publish_check") && typeof r.score === "number" && Number.isFinite(r.score) && !!r.created_at;

const toResult = (r: ScoreRow | undefined): GateResult | null =>
  r ? { score: r.score as number, bar: typeof r.bar === "number" ? r.bar : null, passed: typeof r.passed === "boolean" ? r.passed : null, at: r.created_at, mode: r.gate_mode ?? null } : null;

const failingOf = (failures: unknown): string[] => {
  if (!Array.isArray(failures)) return [];
  const out: string[] = [];
  for (const f of failures) {
    const id = f && typeof f === "object" ? (f as { criterion?: unknown }).criterion : null;
    if (typeof id === "string" && id.trim() && !out.includes(id)) out.push(id);
    if (out.length >= 5) break;
  }
  return out;
};

/** Verdict from the newest scored row. A row with no recorded pass/fail is NOT_VERIFIED, never assumed. */
function verdictOf(newest: GateResult | null): SiteVerdict {
  if (!newest || newest.passed === null) return NOT_VERIFIED;
  return newest.passed ? "passed" : "below_bar";
}

export function buildScoreboard(input: {
  sites: RecentSite[] | null;
  rows: ScoreRow[] | null;
  now?: number;
}): GateScoreboard {
  const logAvailable = Array.isArray(input.rows);
  const sitesAvailable = Array.isArray(input.sites);
  const rows = (input.rows ?? []).filter(isScored);
  const byOrg = new Map<string, ScoreRow[]>();
  for (const r of rows) byOrg.set(r.organization_id, [...(byOrg.get(r.organization_id) ?? []), r]);
  for (const list of byOrg.values()) list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const sites: SiteScore[] = (input.sites ?? []).map((site) => {
    const list = logAvailable ? byOrg.get(site.organizationId) ?? [] : [];
    const build = toResult(list.find((r) => r.event_kind === "build_score"));
    const publish = toResult(list.find((r) => r.event_kind === "publish_check"));
    const newestRow = list[0];
    const newest = toResult(newestRow);
    return {
      organizationId: site.organizationId,
      name: site.name,
      lastBuildAt: site.lastBuildAt,
      build,
      publish,
      verdict: verdictOf(newest),
      failing: newestRow && newest?.passed === false ? failingOf(newestRow.failures) : [],
      n: list.length,
    };
  });
  const measured = { passed: 0, belowBar: 0, notVerified: 0 };
  for (const s of sites) {
    if (s.verdict === "passed") measured.passed++;
    else if (s.verdict === "below_bar") measured.belowBar++;
    else measured.notVerified++;
  }
  return { checkedAt: new Date(input.now ?? Date.now()).toISOString(), logAvailable, sitesAvailable, sites, measured };
}

/** "82/100 (bar 80)" from a stored result, or NOT_VERIFIED. */
export function formatGate(result: GateResult | null): string {
  if (!result) return NOT_VERIFIED;
  return `${Math.round(result.score)}/100${result.bar === null ? "" : ` (bar ${result.bar})`}`;
}

/** Recent sites from build jobs, newest first, one per workspace. */
export function recentSitesFromJobs(
  jobs: { organization_id: string; updated_at: string }[] | null,
  names: Map<string, string> | null,
  limit = 20,
): RecentSite[] | null {
  if (!jobs) return null;
  const seen = new Map<string, string>();
  for (const j of [...jobs].sort((a, b) => b.updated_at.localeCompare(a.updated_at))) {
    if (!seen.has(j.organization_id)) seen.set(j.organization_id, j.updated_at);
    if (seen.size >= limit) break;
  }
  return [...seen].map(([organizationId, lastBuildAt]) => ({ organizationId, name: names?.get(organizationId) ?? null, lastBuildAt }));
}
