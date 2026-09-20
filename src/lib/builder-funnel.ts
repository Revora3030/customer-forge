/**
 * Builder → publish drop-off.
 *
 * Turns the raw event rows into an honest answer to three questions: how many
 * owners reached a live website, which step the rest stopped at, and what
 * stopped them. Everything is counted per workspace, so one owner pressing
 * publish three times is one owner, and a workspace is only ever counted at the
 * furthest step it actually reached.
 */

export const BUILDER_FUNNEL_EVENTS = [
  "builder_opened",
  "build_requested",
  "build_applied",
  "build_failed",
  "publish_blocked",
  "publish_failed",
  "site_published",
] as const;

export type BuilderFunnelEvent = (typeof BUILDER_FUNNEL_EVENTS)[number];

export interface BuilderFunnelRow {
  event_name: string;
  session_id?: string | null;
  metadata?: unknown;
  created_at?: string | null;
}

/** The ordered steps an owner walks from opening the builder to going live. */
export const BUILDER_STAGES = [
  {
    key: "opened",
    label: "Opened the builder",
    blurb: "Reached the place where a website gets built.",
  },
  {
    key: "requested",
    label: "Asked Revora for something",
    blurb: "Described what they wanted built or changed.",
  },
  {
    key: "applied",
    label: "Got changes on the page",
    blurb: "Revora carried the request out on their website.",
  },
  {
    key: "published",
    label: "Website went live",
    blurb: "Confirmed live by the server, not by a button press.",
  },
] as const;

export type BuilderStageKey = (typeof BUILDER_STAGES)[number]["key"];

export interface BuilderStageResult {
  key: BuilderStageKey;
  label: string;
  blurb: string;
  /** Workspaces that reached this step. */
  count: number;
  /** Share of the workspaces that opened the builder. */
  rate: number;
  /** Workspaces whose furthest step was this one — they stopped here. */
  droppedHere: number;
  /** Share of the workspaces that reached this step and went no further. */
  dropRate: number;
}

export interface BuilderReason {
  reason: string;
  label: string;
  /** Workspaces affected — not the number of attempts. */
  workspaces: number;
}

export interface BuilderFunnelSummary {
  days: number;
  opened: number;
  requested: number;
  applied: number;
  published: number;
  requestRate: number;
  publishRate: number;
  stages: BuilderStageResult[];
  /** Why publishing was refused, most common first. */
  publishBlockers: BuilderReason[];
  /** Why a build request could not be carried out, most common first. */
  buildFailures: BuilderReason[];
  /** Workspaces that hit a passing glitch while publishing and could retry. */
  publishGlitches: number;
  /** Workspaces that were refused or broke at publish and never went live. */
  stuckAtPublish: number;
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const rate = (part: number, whole: number) => (whole > 0 ? round1((part / whole) * 100) : 0);

/** Reads the workspace this row belongs to, falling back to the browser visit. */
function keyOf(row: BuilderFunnelRow): string {
  const meta = (row.metadata ?? null) as { organization_id?: unknown } | null;
  const org = typeof meta?.organization_id === "string" ? meta.organization_id.trim() : "";
  if (org) return org;
  return typeof row.session_id === "string" ? row.session_id.trim() : "";
}

function reasonOf(row: BuilderFunnelRow): string {
  const meta = (row.metadata ?? null) as { reason?: unknown } | null;
  const reason = typeof meta?.reason === "string" ? meta.reason.trim().toLowerCase() : "";
  return reason.length > 0 && reason.length <= 60 ? reason : "unknown";
}

/** Plain-language names for the reasons the builder records. */
const REASON_LABELS: Record<string, string> = {
  setup_unpaid: "One-time setup fee not paid yet",
  locked: "Going live is still locked for this workspace",
  not_ready: "Website not finished enough to go live",
  suspended: "Workspace suspended",
  not_permitted: "Signed-in person cannot publish",
  no_content: "Nothing on the website to publish yet",
  nothing_to_change: "Request did not match anything on the website",
  unsafe: "Request needed confirmation before changing the website",
  service_unavailable: "Revora could not be reached at that moment",
  unknown: "Reason not recorded",
};

export function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason.replace(/_/g, " ");
}

function tally(map: Map<string, Set<string>>): BuilderReason[] {
  return [...map.entries()]
    .map(([reason, keys]) => ({
      reason,
      label: reasonLabel(reason),
      workspaces: keys.size,
    }))
    .sort((a, b) => b.workspaces - a.workspaces || a.reason.localeCompare(b.reason));
}

export function summarizeBuilderFunnel(
  rows: readonly BuilderFunnelRow[],
  days: number,
): BuilderFunnelSummary {
  const opened = new Set<string>();
  const requested = new Set<string>();
  const applied = new Set<string>();
  const published = new Set<string>();
  const glitched = new Set<string>();
  const blockedReasons = new Map<string, Set<string>>();
  const failureReasons = new Map<string, Set<string>>();

  const addReason = (map: Map<string, Set<string>>, reason: string, key: string) => {
    const existing = map.get(reason) ?? new Set<string>();
    existing.add(key);
    map.set(reason, existing);
  };

  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    switch (row.event_name) {
      case "builder_opened":
        opened.add(key);
        break;
      case "build_requested":
        requested.add(key);
        break;
      case "build_applied":
        applied.add(key);
        break;
      case "site_published":
        published.add(key);
        break;
      case "build_failed":
        addReason(failureReasons, reasonOf(row), key);
        break;
      case "publish_blocked":
        addReason(blockedReasons, reasonOf(row), key);
        break;
      case "publish_failed":
        glitched.add(key);
        break;
      default:
        break;
    }
  }

  // Reaching a later step proves the earlier ones happened, even when their
  // event was lost (older session, storage blocked, page closed early), so no
  // step can ever report fewer workspaces than the step beneath it.
  for (const key of published) applied.add(key);
  for (const key of applied) requested.add(key);
  for (const key of requested) opened.add(key);
  for (const key of glitched) opened.add(key);
  for (const keys of blockedReasons.values()) for (const key of keys) opened.add(key);
  for (const keys of failureReasons.values()) for (const key of keys) opened.add(key);

  const counts: Record<BuilderStageKey, number> = {
    opened: opened.size,
    requested: requested.size,
    applied: applied.size,
    published: published.size,
  };

  const stages: BuilderStageResult[] = BUILDER_STAGES.map((stage, index) => {
    const next = BUILDER_STAGES[index + 1];
    const reached = counts[stage.key];
    const wentFurther = next ? counts[next.key] : reached;
    const droppedHere = next ? Math.max(0, reached - wentFurther) : 0;
    return {
      key: stage.key,
      label: stage.label,
      blurb: stage.blurb,
      count: reached,
      rate: rate(reached, counts.opened),
      droppedHere,
      dropRate: rate(droppedHere, reached),
    };
  });

  const stuck = new Set<string>();
  for (const keys of blockedReasons.values()) for (const key of keys) stuck.add(key);
  for (const key of glitched) stuck.add(key);
  for (const key of published) stuck.delete(key);

  return {
    days,
    opened: counts.opened,
    requested: counts.requested,
    applied: counts.applied,
    published: counts.published,
    requestRate: rate(counts.requested, counts.opened),
    publishRate: rate(counts.published, counts.opened),
    stages,
    publishBlockers: tally(blockedReasons),
    buildFailures: tally(failureReasons),
    publishGlitches: glitched.size,
    stuckAtPublish: stuck.size,
  };
}
