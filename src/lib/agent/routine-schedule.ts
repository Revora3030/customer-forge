/**
 * Owner routine schedules (PAI-17). Times are America/New_York wall-clock times,
 * so "9:00" stays 9:00 across daylight saving changes.
 */
export const ROUTINE_TZ = "America/New_York";

export type RoutineFrequency = "daily" | "weekly" | "monthly";

export type RoutineSchedule = {
  frequency: RoutineFrequency;
  /** 0 = Sunday … 6 = Saturday. Weekly only. */
  weekday?: number | null;
  /** 1–28 (28 so every month has the day). Monthly only. */
  monthDay?: number | null;
  hour: number;
  minute: number;
};

type Wall = { y: number; m: number; d: number; hh: number; mm: number; weekday: number };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function wallParts(instant: Date): Wall {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ROUTINE_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    y: Number(get("year")), m: Number(get("month")), d: Number(get("day")),
    hh: Number(get("hour")) % 24, mm: Number(get("minute")), weekday: WEEKDAYS.indexOf(get("weekday")),
  };
}

/** The UTC instant at which New York's wall clock reads y-m-d hh:mm (null in a daylight-saving gap). */
function wallToInstant(y: number, m: number, d: number, hh: number, mm: number): Date | null {
  for (const offsetHours of [4, 5]) {
    const guess = new Date(Date.UTC(y, m - 1, d, hh + offsetHours, mm));
    const w = wallParts(guess);
    if (w.y === y && w.m === m && w.d === d && w.hh === hh && w.mm === mm) return guess;
  }
  return null;
}

export function validateSchedule(s: RoutineSchedule): string | null {
  if (!Number.isInteger(s.hour) || s.hour < 0 || s.hour > 23) return "Pick an hour between 0 and 23.";
  if (!Number.isInteger(s.minute) || s.minute < 0 || s.minute > 59) return "Pick a minute between 0 and 59.";
  if (s.frequency === "weekly" && !(Number.isInteger(s.weekday) && s.weekday! >= 0 && s.weekday! <= 6)) return "Pick a day of the week.";
  if (s.frequency === "monthly" && !(Number.isInteger(s.monthDay) && s.monthDay! >= 1 && s.monthDay! <= 28)) return "Pick a day of the month between 1 and 28.";
  if (!["daily", "weekly", "monthly"].includes(s.frequency)) return "Pick daily, weekly or monthly.";
  return null;
}

/**
 * The first scheduled time strictly after `after`. Computed from "now", never
 * from the missed slot, so a routine that was late fires once and then moves on.
 */
export function nextRunAfter(s: RoutineSchedule, after: Date): Date {
  const problem = validateSchedule(s);
  if (problem) throw new Error(problem);
  const start = wallParts(after);
  for (let offset = 0; offset <= 62; offset++) {
    const day = new Date(Date.UTC(start.y, start.m - 1, start.d + offset, 12));
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth() + 1;
    const d = day.getUTCDate();
    if (s.frequency === "weekly" && day.getUTCDay() !== s.weekday) continue;
    if (s.frequency === "monthly" && d !== s.monthDay) continue;
    const at = wallToInstant(y, m, d, s.hour, s.minute);
    if (at && at.getTime() > after.getTime()) return at;
  }
  throw new Error("Could not work out the next run time.");
}
