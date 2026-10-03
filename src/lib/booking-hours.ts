/**
 * Checks a requested booking against the owner's opening hours.
 *
 * Opening hours are stored as free text per day ("9am-5pm", "09:00 – 17:30",
 * "Closed"). The visitor's form sends the wall-clock date and time they chose
 * in the business's calendar, so the check is done on that local time rather
 * than on a UTC timestamp whose original time zone is unknown.
 *
 * Hours that cannot be read are never used to refuse a real customer: only a
 * day explicitly marked closed, or a time clearly outside a readable range, is
 * refused.
 */

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type DayKey = (typeof DAY_KEYS)[number];

const ALIASES: Record<string, DayKey> = {
  sun: "sun", sunday: "sun",
  mon: "mon", monday: "mon",
  tue: "tue", tues: "tue", tuesday: "tue",
  wed: "wed", weds: "wed", wednesday: "wed",
  thu: "thu", thur: "thu", thurs: "thu", thursday: "thu",
  fri: "fri", friday: "fri",
  sat: "sat", saturday: "sat",
};

function entryText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record["closed"] === true) return "closed";
    if (typeof record["open"] === "string" && typeof record["close"] === "string")
      return `${record["open"]}-${record["close"]}`;
    for (const key of ["hours", "open", "time", "value", "label", "text"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    }
  }
  return null;
}

/** Minutes after midnight for "9", "9am", "9:30 pm", "17:00", "noon". */
export function parseClock(raw: string): number | null {
  const text = raw.trim().toLowerCase().replace(/\./g, "");
  if (text === "noon") return 12 * 60;
  if (text === "midnight") return 0;
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/.exec(text);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3];
  if (minute > 59 || hour > 24) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem.startsWith("p") && hour !== 12) hour += 12;
    if (meridiem.startsWith("a") && hour === 12) hour = 0;
  }
  return hour * 60 + minute;
}

export type DayHours = { closed: true } | { closed: false; open: number; close: number } | null;

/** Reads one day's text. `null` means "not readable — do not refuse". */
export function parseDayHours(text: string | null): DayHours {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (/\bclosed\b|\bshut\b|^no$|^none$/.test(lower)) return { closed: true };
  if (/24\s*(hours|hrs|h|\/7)|open all day/.test(lower)) return { closed: false, open: 0, close: 24 * 60 };
  const parts = lower.split(/\s*(?:-|–|—|to|until)\s*/);
  if (parts.length !== 2) return null;
  let open = parseClock(parts[0]!);
  const close = parseClock(parts[1]!);
  if (open === null || close === null) return null;
  // "9-5" without am/pm: a closing hour earlier than opening means afternoon.
  let end = close;
  if (end <= open && !/[ap]/.test(parts[1]!)) end += 12 * 60;
  if (end <= open) return null;
  if (open < 0) open = 0;
  return { closed: false, open, close: Math.min(end, 24 * 60) };
}

/** The owner's hours as a weekday map; `{}` when nothing is set. */
export function readWeeklyHours(value: unknown): Partial<Record<DayKey, DayHours>> {
  const out: Partial<Record<DayKey, DayHours>> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const day = ALIASES[key.trim().toLowerCase()];
    if (!day) continue;
    out[day] = parseDayHours(entryText(raw));
  }
  return out;
}

export type BookingCheck = { ok: true } | { ok: false; reason: string };

/**
 * `localDate` is "YYYY-MM-DD" and `localTime` "HH:MM" as picked on the form.
 * `nowLocalDate` lets callers reject a date already in the past.
 */
export function checkBookingTime(input: {
  hours: unknown;
  localDate: string;
  localTime: string;
  durationMinutes: number;
}): BookingCheck {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.localDate);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(input.localTime);
  if (!dateMatch || !timeMatch) return { ok: false, reason: "Choose a valid date and time." };
  const date = new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])));
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(dateMatch[3]))
    return { ok: false, reason: "Choose a valid date and time." };
  const start = Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
  if (start >= 24 * 60) return { ok: false, reason: "Choose a valid date and time." };

  const weekly = readWeeklyHours(input.hours);
  const day = DAY_KEYS[date.getUTCDay()]!;
  if (!Object.keys(weekly).length) return { ok: true };
  if (!(day in weekly)) return { ok: true };
  const hours = weekly[day];
  if (hours === null || hours === undefined) return { ok: true };
  if (hours.closed) return { ok: false, reason: "The business is closed that day. Please choose another day." };
  const end = start + Math.max(1, input.durationMinutes);
  if (start < hours.open || end > hours.close) {
    return { ok: false, reason: "That time is outside opening hours. Please choose another time." };
  }
  return { ok: true };
}
