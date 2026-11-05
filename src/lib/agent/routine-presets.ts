/**
 * JC-53: which routines an owner can turn on from the app, and how a schedule
 * reads in plain words. Read-only presets first: both only read the workspace
 * and write something for the owner; neither can contact anyone
 * (send policy `no_external_actions`, set in SQL). Review asks and custom
 * routines stay server-side until outbound routines are approved.
 */
import type { RoutineSchedule } from "./routine-schedule";

export const OWNER_ROUTINE_PRESETS = ["weekly_digest", "site_refresh"] as const;
export type OwnerRoutinePreset = (typeof OWNER_ROUTINE_PRESETS)[number];

export const OWNER_PRESET_COPY: Record<OwnerRoutinePreset, { label: string; blurb: string }> = {
  weekly_digest: {
    label: "Weekly digest",
    blurb: "Every week, a short summary of new leads, replies waiting, bookings and your site. Read-only: it contacts no one.",
  },
  site_refresh: {
    label: "Site refresh ideas",
    blurb: "Once a month, a list of suggested updates to your website for you to review. It never changes or publishes your site.",
  },
};

export const isOwnerRoutinePreset = (value: unknown): value is OwnerRoutinePreset =>
  typeof value === "string" && (OWNER_ROUTINE_PRESETS as readonly string[]).includes(value);

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function clock(hour: number, minute: number) {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"} ET`;
}

function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

export function scheduleLabel(s: RoutineSchedule): string {
  const at = clock(s.hour, s.minute);
  if (s.frequency === "weekly") return `Every ${DAYS[s.weekday ?? 0]} at ${at}`;
  if (s.frequency === "monthly") return `On the ${ordinal(s.monthDay ?? 1)} of each month at ${at}`;
  return `Every day at ${at}`;
}
