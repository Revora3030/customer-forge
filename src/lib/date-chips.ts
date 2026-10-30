/**
 * Days offered by the booking date-chip strip. Dates are wall-clock
 * "YYYY-MM-DD" strings in the business's calendar (the same value the native
 * date input sent), and a day is only marked closed when the owner's hours
 * explicitly say so; unreadable hours never hide a day.
 */
import { readWeeklyHours } from "@/lib/booking-hours";
import { closedOnHolidays, holidayOn, type Holiday } from "@/lib/holidays";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type DateChip = { iso: string; weekday: string; day: number; month: string; label: string; closed: boolean; relative: "Today" | "Tomorrow" | null };

function parseIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCDate() === Number(m[3]) ? d : null;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDay = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** The visitor's local calendar date as "YYYY-MM-DD". */
export function localIsoToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** `count` consecutive days from `todayIso`, with closed days flagged from the owner's hours. */
export function dateChipDays(
  todayIso: string,
  count: number,
  hours: unknown,
  holidays?: readonly Holiday[] | null,
): DateChip[] {
  const holidayClosed = closedOnHolidays(hours);
  const start = parseIso(todayIso);
  if (!start || count <= 0) return [];
  const weekly = readWeeklyHours(hours);
  const out: DateChip[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    const dow = d.getUTCDay();
    const entry = weekly[DAY_KEYS[dow]!];
    const relative = i === 0 ? "Today" : i === 1 ? "Tomorrow" : null;
    out.push({
      iso: isoDay(d),
      weekday: WEEKDAYS[dow]!,
      day: d.getUTCDate(),
      month: MONTHS[d.getUTCMonth()]!,
      label: `${relative ? `${relative}, ` : ""}${LONG_WEEKDAYS[dow]} ${d.getUTCDate()} ${LONG_MONTHS[d.getUTCMonth()]}`,
      closed: Boolean(entry && entry.closed) || (holidayClosed && !!holidayOn(holidays, isoDay(d))),
      relative,
    });
  }
  return out;
}

/** Next open chip index from `from` in direction `step` (no wrap); `from` if none. */
export function nextOpenChip(chips: readonly DateChip[], from: number, step: 1 | -1): number {
  for (let i = from + step; i >= 0 && i < chips.length; i += step) if (!chips[i]!.closed) return i;
  return from;
}
