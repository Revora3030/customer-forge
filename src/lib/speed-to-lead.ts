/**
 * Speed to lead: how long a new enquiry waits before someone contacts it.
 * Pure arithmetic over the owner's own lead and activity records; a lead counts
 * as answered only when a call, email or text was logged for it after it arrived.
 */
export const RESPONSE_KINDS = ["call", "email", "text"] as const;
export const SPEED_GOAL_MINUTES = 5;
export const SPEED_WINDOW_DAYS = 30;

export type SpeedLead = { id: string; created_at: string };
export type SpeedActivity = { lead_id: string; kind: string; created_at: string };

export type SpeedToLead = {
  /** Leads that arrived inside the window. */
  leadCount: number;
  answered: number;
  /** Leads with no logged contact whose goal window has already passed. */
  missed: number;
  /** Leads with no contact yet that are still inside the goal window. */
  withinGrace: number;
  /** Median minutes to first contact across answered leads, null when none. */
  medianMinutes: number | null;
  /** Answered inside the goal, as a share of leads whose goal window has closed. */
  withinGoalPct: number | null;
  /** The longest-waiting leads with no contact, longest first (up to five). */
  waiting: { id: string; minutes: number }[];
};

const ms = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

export function computeSpeedToLead(
  leads: readonly SpeedLead[],
  activities: readonly SpeedActivity[],
  now: Date = new Date(),
  windowDays: number = SPEED_WINDOW_DAYS,
  goalMinutes: number = SPEED_GOAL_MINUTES,
): SpeedToLead {
  const nowMs = now.getTime();
  const since = nowMs - windowDays * 86_400_000;
  const goalMs = goalMinutes * 60_000;

  // Earliest logged contact per lead, ignoring anything dated before the lead.
  const kinds = new Set<string>(RESPONSE_KINDS);
  const byLead = new Map<string, number[]>();
  for (const a of activities) {
    if (!kinds.has(a.kind)) continue;
    const t = ms(a.created_at);
    if (t === null) continue;
    const list = byLead.get(a.lead_id);
    if (list) list.push(t);
    else byLead.set(a.lead_id, [t]);
  }

  const minutesToContact: number[] = [];
  let withinGoal = 0;
  let missed = 0;
  let withinGrace = 0;
  let leadCount = 0;
  const waiting: { id: string; minutes: number }[] = [];

  for (const lead of leads) {
    const created = ms(lead.created_at);
    if (created === null || created < since || created > nowMs) continue;
    leadCount += 1;
    const first = (byLead.get(lead.id) ?? []).filter((t) => t >= created).sort((a, b) => a - b)[0];
    if (first !== undefined) {
      const wait = first - created;
      minutesToContact.push(wait / 60_000);
      if (wait <= goalMs) withinGoal += 1;
      continue;
    }
    const age = nowMs - created;
    if (age >= goalMs) missed += 1;
    else withinGrace += 1;
    waiting.push({ id: lead.id, minutes: Math.floor(age / 60_000) });
  }

  minutesToContact.sort((a, b) => a - b);
  const mid = Math.floor(minutesToContact.length / 2);
  const medianMinutes = minutesToContact.length
    ? minutesToContact.length % 2
      ? minutesToContact[mid]!
      : (minutesToContact[mid - 1]! + minutesToContact[mid]!) / 2
    : null;

  const closed = minutesToContact.length + missed;
  return {
    leadCount,
    answered: minutesToContact.length,
    missed,
    withinGrace,
    medianMinutes: medianMinutes === null ? null : Math.round(medianMinutes * 10) / 10,
    withinGoalPct: closed ? Math.round((withinGoal / closed) * 100) : null,
    waiting: waiting.sort((a, b) => b.minutes - a.minutes).slice(0, 5),
  };
}

/** "3 min", "2 h 10 min", "1 d 4 h" — short and exact enough for a card. */
export function formatWait(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 1) return "under a minute";
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return `${d} d${h ? ` ${h} h` : ""}`;
}
