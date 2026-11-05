/**
 * JC-19: Executive / Jarvis Tower "Today" briefing.
 *
 * Pure ranking of the top things that need the owner, built only from the city
 * snapshot and its approvals rows. No new fetches, no migrations, no writes.
 * One-tap actions are triage drafts for Jarvis; nothing runs until the owner
 * sends them.
 */
import {
  ATTENTION_WINDOW_MS,
  FAILED_STATUSES,
  FAILURE_CAUSE_HINT,
  GATE,
  ageLabel,
  failureGroups,
  triageDraft,
  type CitySnapshot,
  type CityWork,
} from "./ai-city";

/** A running job with no heartbeat for this long is treated as stalled. Matches workIsActive. */
export const RUNNING_STALL_MS = 15 * 60_000;
/** Waiting / retrying jobs with no update for this long are treated as stalled. */
export const WAITING_STALL_MS = 30 * 60_000;

const CI_SIGNAL = /\bci\b|github actions|workflow run|quality gate|codeql|check suite|release check|dependabot/i;

export type BriefingKind = "approvals" | "failures" | "ci" | "stalled";

export type BriefingItem = {
  id: string;
  kind: BriefingKind;
  title: string;
  evidence: string;
  draft: string;
  /** Higher means it needs the owner more; used only for ranking. */
  urgency: number;
};

export type TodayBriefing = {
  available: boolean;
  items: BriefingItem[];
  checkedAt: string | null;
};

const isFailed = (status: string) => (FAILED_STATUSES as readonly string[]).includes(status);

function allRows(snapshot: CitySnapshot): CityWork[] {
  return Object.values(snapshot.sources).flatMap((source) => source.rows);
}

function recentEnough(at: string, now: number): boolean {
  const parsed = Date.parse(at);
  if (!Number.isFinite(parsed)) return false;
  const age = now - parsed;
  return age >= 0 && age <= ATTENTION_WINDOW_MS;
}

/** Jobs whose last heartbeat is older than the stall window while still open. */
export function stalledBuilds(rows: readonly CityWork[], now: number): CityWork[] {
  return rows.filter((row) => {
    const at = Date.parse(row.at);
    if (!Number.isFinite(at) || at > now) return false;
    const age = now - at;
    if (row.status === "running" && age >= RUNNING_STALL_MS) return true;
    if ((row.status === "waiting" || row.status === "retrying") && age >= WAITING_STALL_MS) return true;
    return false;
  });
}

/** Failed records whose title/detail look like CI or release checks. */
export function ciFailureRows(rows: readonly CityWork[], now: number): CityWork[] {
  return rows.filter(
    (row) =>
      isFailed(row.status) &&
      recentEnough(row.at, now) &&
      CI_SIGNAL.test(`${row.title} ${row.detail ?? ""} ${row.source}`),
  );
}

/**
 * Top N things needing the owner today, ranked: pending approvals, then the
 * largest failure group, then recorded CI/check failures, then stalled builds.
 * Missing feeds are skipped (never reported as zero).
 */
export function buildTodayBriefing(snapshot: CitySnapshot | undefined, now: number, limit = 3): TodayBriefing {
  if (!snapshot) return { available: false, items: [], checkedAt: null };

  const candidates: BriefingItem[] = [];
  const rows = allRows(snapshot);

  const approvals = snapshot.sources["approvals"];
  if (approvals?.available) {
    const pending = approvals.rows.filter((row) => row.status === "pending" || row.status === "waiting");
    const count = typeof approvals.total === "number" && approvals.total >= pending.length ? approvals.total : pending.length;
    if (count > 0) {
      const samples = pending.slice(0, 3).map((row) => row.title).filter(Boolean);
      candidates.push({
        id: "approvals",
        kind: "approvals",
        title: count === 1 ? "1 approval waiting on you" : `${count} approvals waiting on you`,
        evidence: samples.length ? samples.join(" · ") : "Pending items in the approval queue",
        draft: `[AI City · Today] ${count} item${count === 1 ? "" : "s"} wait in the approval queue${samples.length ? `: ${samples.join("; ")}` : ""}. Read growth.funnel.summary. For each pending item, restate what it asks and whether the evidence supports approve or reject. ${GATE}`,
        urgency: 4000 + count,
      });
    }
  }

  const groups = failureGroups(rows, now);
  const topGroup = groups[0];
  if (topGroup) {
    const hint = topGroup.cause ? FAILURE_CAUSE_HINT[topGroup.cause] : "Open the newest record for its saved reason.";
    candidates.push({
      id: `failures:${topGroup.key}`,
      kind: "failures",
      title: topGroup.count > 1 ? `${topGroup.count} failed · ${topGroup.label}` : `Failed: ${topGroup.label}`,
      evidence: `${hint} Newest ${ageLabel(topGroup.ageMs)} ago.`,
      draft: triageDraft(topGroup, now).replace("[AI City · Triage]", "[AI City · Today]"),
      urgency: 3000 + topGroup.count,
    });
  }

  const ciRows = ciFailureRows(rows, now);
  if (ciRows.length) {
    const samples = ciRows.slice(0, 2).map((row) => row.title);
    candidates.push({
      id: "ci",
      kind: "ci",
      title: ciRows.length === 1 ? "CI / check failure recorded" : `${ciRows.length} CI / check failures recorded`,
      evidence: samples.join(" · "),
      draft: `[AI City · Today] City feeds show ${ciRows.length} CI or check failure${ciRows.length === 1 ? "" : "s"}: ${samples.join("; ")}. Read release.ci.evidence for lovable-sync. Say whether the current commit's checks passed, failed or are missing; missing evidence is not a pass. ${GATE}`,
      urgency: 2000 + ciRows.length,
    });
  }

  const jobs = snapshot.sources["jobs"];
  if (jobs?.available) {
    const stalled = stalledBuilds(jobs.rows, now);
    if (stalled.length) {
      const samples = stalled.slice(0, 3).map((row) => {
        const age = Math.max(0, now - Date.parse(row.at));
        return `${row.title} (last heartbeat ${ageLabel(age)} ago)`;
      });
      candidates.push({
        id: "stalled",
        kind: "stalled",
        title: stalled.length === 1 ? "1 build looks stalled" : `${stalled.length} builds look stalled`,
        evidence: samples.join(" · "),
        draft: `[AI City · Today] ${stalled.length} build${stalled.length === 1 ? "" : "s"} look stalled (no recent heartbeat): ${samples.join("; ")}. Read builder.health.summary. For each, say whether it is still stuck and the smallest safe next step. ${GATE}`,
        urgency: 1000 + stalled.length,
      });
    }
  }

  candidates.sort((a, b) => b.urgency - a.urgency || a.id.localeCompare(b.id));
  return { available: true, items: candidates.slice(0, limit), checkedAt: snapshot.checkedAt };
}
