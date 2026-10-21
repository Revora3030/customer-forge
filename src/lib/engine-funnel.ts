/**
 * The prospect engine funnel ("Engine today"): pure aggregation, shared by the
 * server function, the Jarvis read action and the Operations card.
 *
 * Stages, each counted per business (organization), in total and for the
 * current UTC day, broken down by US state:
 * - Discovered: businesses the engine surfaced. Every provisioned demo, plus the
 *   rotation cursor's latest finds that were not built (last_found - last_built
 *   per trade x metro), so rotation searches that built nothing still show.
 * - Enriched: demos whose published email enrichment verified.
 * - Built: demos whose latest build completed.
 * - Delivered: demos with a sent first-touch email or text.
 * - Viewed: demos whose preview recorded at least one view.
 * - Claimed: demos the business claimed.
 * - Converted: claimed workspaces that paid (setup fee recorded, or an active subscription).
 *
 * A source that could not be read is null, never zero: its stage reads as
 * unknown and is listed in `unavailable`.
 */

export const ENGINE_FUNNEL_STAGES = [
  { key: "discovered", label: "Discovered" },
  { key: "enriched", label: "Enriched" },
  { key: "built", label: "Built" },
  { key: "delivered", label: "Delivered" },
  { key: "viewed", label: "Viewed" },
  { key: "claimed", label: "Claimed" },
  { key: "converted", label: "Converted" },
] as const;

export type EngineFunnelStageKey = (typeof ENGINE_FUNNEL_STAGES)[number]["key"];

export const UNKNOWN_STATE = "unknown";

/** One prospect demo with the moment it reached each demo-side stage (null: not reached). */
export type FunnelDemo = {
  organizationId: string;
  /** Two-letter US state code, or null when unknown. */
  state: string | null;
  createdAt: string | null;
  enrichedAt: string | null;
  claimedAt: string | null;
};

export type FunnelRotationRow = { state: string | null; lastSearchedAt: string | null; lastFound: number; lastBuilt: number };
export type FunnelEvent = { organizationId: string; at: string | null };

export type EngineFunnelInputs = {
  /** Null when the demo list could not be read. */
  demos: FunnelDemo[] | null;
  /** Null when the rotation cursor table is missing or unreadable. */
  rotation: FunnelRotationRow[] | null;
  /** Build completions (latest job per demo); null when unreadable. */
  builds: FunnelEvent[] | null;
  /** Sent first touches; null when unreadable. */
  deliveries: FunnelEvent[] | null;
  /** Preview view events; null when the telemetry table is missing or unreadable. */
  views: FunnelEvent[] | null;
  /** Paid workspaces with when they paid (null at: paid, time unknown); null when unreadable. */
  conversions: FunnelEvent[] | null;
};

export type FunnelCount = { total: number; today: number };

export type EngineFunnelStage = {
  key: EngineFunnelStageKey;
  label: string;
  /** Null: the source could not be read. */
  total: number | null;
  today: number | null;
  byState: Record<string, FunnelCount>;
};

export type EngineFunnel = {
  /** The UTC day "today" covers, YYYY-MM-DD. */
  day: string;
  stages: EngineFunnelStage[];
  /** Stages whose source could not be read. */
  unavailable: EngineFunnelStageKey[];
};

export const startOfUtcDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

const stateKey = (state: string | null | undefined) => {
  const code = (state ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : UNKNOWN_STATE;
};

/** Counts organizations once each: total, and today when their (earliest) time falls on today. */
function countOrgs(entries: Array<{ organizationId: string; at: string | null; state: string | null }>, dayStart: number, dayEnd: number) {
  const first = new Map<string, { at: number | null; state: string }>();
  for (const entry of entries) {
    const at = Date.parse(entry.at ?? "");
    const time = Number.isFinite(at) ? at : null;
    const current = first.get(entry.organizationId);
    if (!current) first.set(entry.organizationId, { at: time, state: stateKey(entry.state) });
    else if (time !== null && (current.at === null || time < current.at)) current.at = time;
  }
  const out = { total: 0, today: 0, byState: {} as Record<string, FunnelCount> };
  for (const { at, state } of first.values()) {
    const isToday = at !== null && at >= dayStart && at < dayEnd;
    out.total += 1;
    if (isToday) out.today += 1;
    const bucket = (out.byState[state] ??= { total: 0, today: 0 });
    bucket.total += 1;
    if (isToday) bucket.today += 1;
  }
  return out;
}

export function aggregateEngineFunnel(inputs: EngineFunnelInputs, now: Date): EngineFunnel {
  const dayStart = startOfUtcDay(now).getTime();
  const dayEnd = dayStart + 86_400_000;
  const demos = inputs.demos;
  const stateByOrg = new Map((demos ?? []).map((demo) => [demo.organizationId, demo.state]));
  // Events are counted only for known prospect demos (a manual send to another org is not engine output).
  const forDemos = (events: FunnelEvent[] | null) =>
    events && demos
      ? events.filter((event) => stateByOrg.has(event.organizationId)).map((event) => ({ ...event, state: stateByOrg.get(event.organizationId) ?? null }))
      : null;
  const fromDemos = (pick: (demo: FunnelDemo) => string | null, require: (demo: FunnelDemo) => boolean = (demo) => pick(demo) !== null) =>
    demos ? demos.filter(require).map((demo) => ({ organizationId: demo.organizationId, at: pick(demo), state: demo.state })) : null;

  const counted: Record<EngineFunnelStageKey, ReturnType<typeof countOrgs> | null> = {
    discovered: null,
    enriched: null,
    built: null,
    delivered: null,
    viewed: null,
    claimed: null,
    converted: null,
  };

  const provisioned = fromDemos((demo) => demo.createdAt, () => true);
  if (provisioned) {
    const discovered = countOrgs(provisioned, dayStart, dayEnd);
    // Rotation finds that were never built: a count per search, not per organization.
    for (const row of inputs.rotation ?? []) {
      const unbuilt = Math.max(0, Math.floor(row.lastFound) - Math.floor(row.lastBuilt));
      if (!unbuilt) continue;
      const at = Date.parse(row.lastSearchedAt ?? "");
      const isToday = Number.isFinite(at) && at >= dayStart && at < dayEnd;
      const state = stateKey(row.state);
      discovered.total += unbuilt;
      const bucket = (discovered.byState[state] ??= { total: 0, today: 0 });
      bucket.total += unbuilt;
      if (isToday) {
        discovered.today += unbuilt;
        bucket.today += unbuilt;
      }
    }
    counted.discovered = discovered;
  }
  const enriched = fromDemos((demo) => demo.enrichedAt);
  if (enriched) counted.enriched = countOrgs(enriched, dayStart, dayEnd);
  const builds = forDemos(inputs.builds);
  if (builds) counted.built = countOrgs(builds, dayStart, dayEnd);
  const deliveries = forDemos(inputs.deliveries);
  if (deliveries) counted.delivered = countOrgs(deliveries, dayStart, dayEnd);
  const views = forDemos(inputs.views);
  if (views) counted.viewed = countOrgs(views, dayStart, dayEnd);
  const claimed = fromDemos((demo) => demo.claimedAt);
  if (claimed) counted.claimed = countOrgs(claimed, dayStart, dayEnd);
  const conversions = forDemos(inputs.conversions);
  if (conversions) counted.converted = countOrgs(conversions, dayStart, dayEnd);

  const stages = ENGINE_FUNNEL_STAGES.map(({ key, label }): EngineFunnelStage => {
    const count = counted[key];
    return { key, label, total: count?.total ?? null, today: count?.today ?? null, byState: count?.byState ?? {} };
  });
  return {
    day: new Date(dayStart).toISOString().slice(0, 10),
    stages,
    unavailable: stages.filter((stage) => stage.total === null).map((stage) => stage.key),
  };
}

/** States ordered by their discovered total (then name), for the card's breakdown. */
export function funnelStates(funnel: EngineFunnel): string[] {
  const totals = new Map<string, number>();
  for (const stage of funnel.stages) for (const [state, count] of Object.entries(stage.byState)) totals.set(state, Math.max(totals.get(state) ?? 0, count.total));
  return [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([state]) => state);
}
