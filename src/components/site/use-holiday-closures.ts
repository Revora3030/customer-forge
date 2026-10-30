import { useEffect, useState } from "react";
import { closedOnHolidays, holidayClosureText, nextHoliday, type Holiday } from "@/lib/holidays";
import { getUpcomingHolidays } from "@/lib/holidays.functions";

/**
 * Upcoming national holidays, fetched only when the owner switched on
 * "Closed on public holidays". Starts (and on any failure stays) empty, so the
 * booking form fails open and the server re-checks every request anyway.
 */
export function useHolidayClosures(hours: unknown): Holiday[] {
  const enabled = closedOnHolidays(hours);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    const d = new Date();
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    getUpcomingHolidays({ data: { from } })
      .then((list) => {
        if (live && Array.isArray(list)) setHolidays(list);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [enabled]);
  return enabled ? holidays : [];
}

/** "Closed Thursday, November 26 for Thanksgiving Day" when one is coming up (within ~6 weeks). */
export function useNextHolidayClosure(hours: unknown): string | null {
  const holidays = useHolidayClosures(hours);
  const today = new Date();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const next = nextHoliday(holidays, iso(today));
  if (!next) return null;
  const horizon = iso(new Date(today.getTime() + 42 * 86_400_000));
  return next.date <= horizon ? holidayClosureText(next) : null;
}
