/**
 * "What Revora did for you": the work the platform did for one business in a
 * period, counted from real delivery records only (no estimates, no
 * projections). It is the proof behind the monthly fee: alerts that reached
 * the owner, follow-ups sent for them, reminders, reports, site checks and publishes.
 */

export const WORK_WINDOW_DAYS = 30;

export const WORK_ITEMS = [
  { key: "leadAlerts", label: "New-lead alerts sent to you", hint: "Each new lead reached you right away." },
  { key: "followUps", label: "Follow-ups sent for you", hint: "Automatic messages to your leads and customers." },
  { key: "leadReminders", label: "Reminders about waiting leads", hint: "Nudges when a lead sat unanswered for a day." },
  { key: "weeklyReports", label: "Weekly reports", hint: "Your leads and site summary, by email." },
  { key: "siteChecks", label: "Website pages checked", hint: "Automatic checks for broken or slow pages." },
  { key: "siteAlerts", label: "Website problems flagged", hint: "Problems we found and told you about." },
  { key: "publishes", label: "Website updates published", hint: "New versions of your site that went live." },
] as const;

export type WorkKey = (typeof WORK_ITEMS)[number]["key"];
/** A count per item; null when the record could not be read. */
export type WorkCounts = Record<WorkKey, number | null>;

export type WorkLine = {
  key: WorkKey;
  label: string;
  hint: string;
  current: number;
  previous: number | null;
  change: number | null;
};

export type WorkSummary = {
  days: number;
  lines: WorkLine[];
  total: number;
  /** Items whose records could not be read this time. */
  unavailable: string[];
};

/** The two equal windows: [prevStart, start) and [start, now). */
export function workWindows(now: Date, days = WORK_WINDOW_DAYS) {
  const end = now.getTime();
  const start = end - days * 86_400_000;
  const prevStart = start - days * 86_400_000;
  return {
    prevStart: new Date(prevStart).toISOString(),
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
  };
}

/**
 * Lines for the items that have something to show, in a fixed order. An item
 * with nothing in either window is left out instead of shown as a zero, and
 * an unreadable item is listed as unavailable, never counted as 0.
 */
export function summarizeWork(
  current: WorkCounts,
  previous: WorkCounts,
  days = WORK_WINDOW_DAYS,
): WorkSummary {
  const lines: WorkLine[] = [];
  const unavailable: string[] = [];
  for (const item of WORK_ITEMS) {
    const now = current[item.key];
    const before = previous[item.key];
    if (now === null) {
      unavailable.push(item.label);
      continue;
    }
    if (now === 0 && !before) continue;
    lines.push({
      key: item.key,
      label: item.label,
      hint: item.hint,
      current: now,
      previous: before,
      change: before === null ? null : now - before,
    });
  }
  return { days, lines, total: lines.reduce((sum, line) => sum + line.current, 0), unavailable };
}
