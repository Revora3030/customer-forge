/**
 * TEST FIXTURE. Fake AI City data for unit, visual and mobile tests (JC-64).
 *
 * Everything here is invented. Every row title starts with "[TEST FIXTURE]" so a
 * leaked row is obvious on screen. This module must never be imported by
 * production code: `city-fixtures.test.ts` fails the build if any non-test file
 * under src/ refers to it.
 */
import type { CitySnapshot, CitySource, CityWork, DistrictId } from "../ai-city";
import type { JobOutcome } from "../ai-city-metrics";

export const TEST_FIXTURE_LABEL = "TEST FIXTURE";
export const TITLE_PREFIX = `[${TEST_FIXTURE_LABEL}]`;
/** Fixed clock so every fixture is deterministic. */
export const FIXTURE_NOW = Date.parse("2026-11-05T12:00:00.000Z");

/** Source name, district and the key `districtState` expects for each district. */
export const FIXTURE_SOURCES: readonly { key: string; source: string; district: DistrictId }[] = [
  { key: "events", source: "jarvis_events", district: "executive" },
  { key: "routines", source: "jarvis_routines", district: "executive" },
  { key: "jobs", source: "site_build_jobs", district: "factory" },
  { key: "traces", source: "ai_team_trace", district: "institute" },
  { key: "images", source: "site_images", district: "creative" },
  { key: "approvals", source: "approval_queue", district: "growth" },
  { key: "automations", source: "growth_automations", district: "growth" },
  { key: "errors", source: "error_events", district: "security" },
  { key: "memories", source: "jarvis_memories", district: "knowledge" },
];

const minutesAgo = (minutes: number) => new Date(FIXTURE_NOW - minutes * 60_000).toISOString();

export function fixtureRow(over: Partial<CityWork> & { id: string; source: string; district: DistrictId }): CityWork {
  return { title: `${TITLE_PREFIX} work item`, status: "completed", at: minutesAgo(30), ...over };
}

function source(rows: CityWork[] = [], over: Partial<CitySource> = {}): CitySource {
  return { available: true, rows, total: rows.length, truncated: false, ...over };
}

/** A snapshot where each source holds the rows `rowsFor` returns for it. */
export function fixtureSnapshot(rowsFor: (s: (typeof FIXTURE_SOURCES)[number]) => CityWork[], over: Partial<CitySource> = {}): CitySnapshot {
  const sources: Record<string, CitySource> = {};
  for (const s of FIXTURE_SOURCES) sources[s.key] = source(rowsFor(s), over);
  return { checkedAt: new Date(FIXTURE_NOW).toISOString(), sources };
}

const failedRow = (s: (typeof FIXTURE_SOURCES)[number], index: number, minutes = 20 + index, title = `${TITLE_PREFIX} ${s.source} failure ${index % 3}`): CityWork =>
  fixtureRow({ id: `${s.source}-f${index}`, source: s.source, district: s.district, status: "failed", at: minutesAgo(minutes), title });

/** Nothing running, nothing failing, one finished item per source. */
export const quietSnapshot = () => fixtureSnapshot((s) => [fixtureRow({ id: `${s.source}-ok`, source: s.source, district: s.district })]);

/** Zero failures and zero rows: a feed that read fine and is empty. */
export const emptySnapshot = () => fixtureSnapshot(() => []);

/** Exactly one failed build and nothing else. */
export const oneFailureSnapshot = () => fixtureSnapshot((s) => (s.key === "jobs" ? [failedRow(s, 0)] : []));

/** One hundred failed builds in three repeating problems, all inside the 48 hour window. */
export const hundredFailuresSnapshot = () => fixtureSnapshot((s) => (s.key === "jobs" ? Array.from({ length: 100 }, (_, i) => failedRow(s, i)) : []));

/** A feed that hit its row limit with failures still inside the window ("500+"). */
export const truncatedSnapshot = () => {
  const snapshot = fixtureSnapshot((s) => (s.key === "jobs" ? Array.from({ length: 500 }, (_, i) => failedRow(s, i, 5 + (i % 600))) : []));
  const jobs = snapshot.sources["jobs"]!;
  snapshot.sources["jobs"] = { ...jobs, truncated: true, total: null };
  return snapshot;
};

/** Every source holds only failures. */
export const allFailedSnapshot = () => fixtureSnapshot((s) => [failedRow(s, 0), failedRow(s, 1)]);

/** Every source has one running item with a fresh heartbeat. */
export const allRunningSnapshot = () => fixtureSnapshot((s) => [fixtureRow({ id: `${s.source}-run`, source: s.source, district: s.district, status: "running", at: minutesAgo(1) })]);

/** One source could not be read. Its district must say unavailable, never healthy. */
export const unavailableSnapshot = () => {
  const snapshot = quietSnapshot();
  snapshot.sources["jobs"] = { available: false, rows: [], total: null, truncated: false };
  return snapshot;
};

/** Build outcomes for the metrics helpers. */
export const jobOutcomes = {
  none: [] as JobOutcome[],
  oneFailed: [{ status: "failed", failure_kind: "timeout" }] as JobOutcome[],
  hundredFailed: Array.from({ length: 100 }, (_, i): JobOutcome => ({ status: "failed", failure_kind: i % 4 === 0 ? null : "provider" })),
  allQuiet: [{ status: "completed", failure_kind: null }, { status: "completed", failure_kind: null }] as JobOutcome[],
};
