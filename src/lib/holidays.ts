/**
 * Public-holiday closures for booking. Data: Nager.Date (MIT, free, no key,
 * https://date.nager.at), fetched server-side in holidays.server.ts.
 *
 * Owners opt in with the "Closed on public holidays" switch, stored inside the
 * existing `hours` JSON as `closed_on_holidays: true` (no schema change).
 */

export interface Holiday {
  /** YYYY-MM-DD */
  date: string;
  name: string;
}

/** True when the owner chose to close on national public holidays. */
export function closedOnHolidays(hours: unknown): boolean {
  return (
    !!hours &&
    typeof hours === "object" &&
    !Array.isArray(hours) &&
    (hours as Record<string, unknown>)["closed_on_holidays"] === true
  );
}

/** The holiday on `localDate`, if any. */
export function holidayOn(holidays: readonly Holiday[] | null | undefined, localDate: string): Holiday | null {
  return holidays?.find((h) => h.date === localDate) ?? null;
}

/** The first holiday on or after `today` (YYYY-MM-DD). */
export function nextHoliday(holidays: readonly Holiday[] | null | undefined, today: string): Holiday | null {
  return [...(holidays ?? [])].filter((h) => h.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

/** National holidays only, de-duplicated, from either Nager API version. */
export function normaliseHolidays(raw: unknown): Holiday[] {
  if (!Array.isArray(raw)) return [];
  const out = new Map<string, Holiday>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const date = typeof r["date"] === "string" ? r["date"].slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    // v3: `global`; v4: `nationalHoliday`. Regional days are not closures.
    const national = r["global"] === true || r["nationalHoliday"] === true;
    if (!national) continue;
    const types = Array.isArray(r["types"]) ? r["types"] : Array.isArray(r["holidayTypes"]) ? r["holidayTypes"] : null;
    if (types && !types.includes("Public")) continue;
    const name = String(r["name"] ?? r["localName"] ?? "Public holiday").slice(0, 80);
    if (!out.has(date)) out.set(date, { date, name });
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** "Closed Thursday, November 26 for Thanksgiving Day". */
export function holidayClosureText(holiday: Holiday): string {
  const [y, m, d] = holiday.date.split("-").map(Number);
  const day = new Date(Date.UTC(y!, m! - 1, d!, 12)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  return `Closed ${day} for ${holiday.name}`;
}
