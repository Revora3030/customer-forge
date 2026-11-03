/**
 * Monthly value ("ROI") email for workspace owners, sent on the 1st for the
 * month that just ended. Pure helpers so the numbers and the copy are
 * unit-testable without a database; owner-reports.server.ts reads the rows.
 *
 * Every number is counted from the workspace's own records. Nothing is
 * estimated by Revora: booked-work value is the estimated value the owner set
 * on each won lead, and the Revora cost is what was actually collected.
 */
import { monthKey, monthLabel, netRevenue, type MonthKey, type PaymentRow } from "@/lib/monthly-report";

export const MONTHLY_VALUE_KIND = "monthly_value";
/** Sends only in the first days of a month, so a stray mid-month run can't send a stale report. */
export const MONTHLY_VALUE_SEND_DAYS = 7;

export type MonthWindow = { key: MonthKey; label: string; start: string; end: string; previousStart: string };

/** The calendar month (UTC) before `now`, plus the one before it for comparison. */
export function previousMonthWindow(now: Date): MonthWindow {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const key = monthKey(start)!;
  return {
    key,
    label: monthLabel(key),
    start,
    end: new Date(Date.UTC(y, m, 1)).toISOString(),
    previousStart: new Date(Date.UTC(y, m - 2, 1)).toISOString(),
  };
}

export const inSendWindow = (now: Date) => now.getUTCDate() <= MONTHLY_VALUE_SEND_DAYS;

export type ValueLeadRow = { status: string | null; estimated_value: number | string | null; created_at: string };
export type ValueEventRow = { event_type: string | null; session_id: string | null };

export type MonthlyValue = {
  month: MonthKey;
  label: string;
  leads: number;
  previousLeads: number;
  won: number;
  wonValue: number;
  appointments: number;
  visits: number;
  visitors: number;
  ctaClicks: number;
  revoraCost: number;
  /** Booked-work value per $1 paid to Revora, or null when either side is 0. */
  roiMultiple: number | null;
};

const num = (v: number | string | null | undefined) => {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function buildMonthlyValue(input: {
  window: MonthWindow;
  leads: ValueLeadRow[];
  appointments: number;
  events: ValueEventRow[];
  payments: PaymentRow[];
}): MonthlyValue {
  const { window } = input;
  const inMonth = (iso: string) => iso >= window.start && iso < window.end;
  const thisMonth = input.leads.filter((l) => inMonth(l.created_at));
  const previousLeads = input.leads.filter((l) => l.created_at >= window.previousStart && l.created_at < window.start).length;
  const won = thisMonth.filter((l) => l.status === "booked" || l.status === "completed");
  const wonValue = won.reduce((sum, l) => sum + Math.max(0, num(l.estimated_value)), 0);
  const views = input.events.filter((e) => e.event_type === "page_view");
  const visitors = new Set(views.map((e) => e.session_id).filter(Boolean)).size;
  const revoraCost = input.payments
    .filter((p) => monthKey(p.completed_at ?? p.created_at) === window.key)
    .reduce((sum, p) => sum + netRevenue(p).net, 0);
  return {
    month: window.key,
    label: window.label,
    leads: thisMonth.length,
    previousLeads,
    won: won.length,
    wonValue,
    appointments: input.appointments,
    visits: views.length,
    visitors,
    ctaClicks: input.events.filter((e) => e.event_type === "cta_click").length,
    revoraCost,
    roiMultiple: wonValue > 0 && revoraCost > 0 ? wonValue / revoraCost : null,
  };
}

export const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: Number.isInteger(n) ? 0 : 2 })}`;

/** "12 leads, up 4 from September" — only compares when last month had data. */
export function leadTrend(value: Pick<MonthlyValue, "leads" | "previousLeads">, previousLabel: string): string | null {
  if (!value.previousLeads) return null;
  const diff = value.leads - value.previousLeads;
  if (diff === 0) return `the same as ${previousLabel}`;
  return `${diff > 0 ? "up" : "down"} ${Math.abs(diff)} from ${previousLabel}`;
}

export function monthlyValueSubject(name: string, v: MonthlyValue): string {
  if (!v.leads && !v.appointments) return `${name}: your ${v.label} report`;
  return `${name} in ${v.label}: ${v.leads} lead${v.leads === 1 ? "" : "s"}${v.wonValue > 0 ? `, ${usd(v.wonValue)} booked` : ""}`;
}

/** The ROI sentence, or null when it can't be stated honestly. */
export function roiLine(v: MonthlyValue): string | null {
  if (v.roiMultiple === null) return null;
  const multiple = v.roiMultiple >= 10 ? Math.round(v.roiMultiple).toString() : v.roiMultiple.toFixed(1).replace(/\.0$/, "");
  return `You marked ${usd(v.wonValue)} of work as booked or completed, and Revora cost ${usd(v.revoraCost)} this month: about ${multiple}× what you paid.`;
}
