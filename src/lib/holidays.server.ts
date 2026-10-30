/**
 * Fetches national public holidays from Nager.Date (free, no key). The v4 API
 * is tried first, then v3. Results are cached per isolate for a day; a failure
 * is cached briefly as "no holidays" so booking always fails OPEN — an outage
 * never blocks a real customer.
 */
import { normaliseHolidays, type Holiday } from "@/lib/holidays";

const OK_TTL_MS = 24 * 60 * 60_000;
const FAIL_TTL_MS = 10 * 60_000;
const TIMEOUT_MS = 2_500;

const cache = new Map<string, { at: number; ttl: number; holidays: Holiday[] }>();

export function holidayApiUrls(year: number, country: string): string[] {
  return [
    `https://nagerholidays.com/api/v4/Holidays/${country}/${year}`,
    `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`,
  ];
}

async function fetchJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`holiday api ${response.status}`);
  return response.json();
}

/** National public holidays for one year; [] when the API can't be reached. */
export async function publicHolidays(
  year: number,
  country = "US",
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<Holiday[]> {
  const cc = /^[A-Z]{2}$/.test(country) ? country : "US";
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return [];
  const key = `${cc}:${year}`;
  const hit = cache.get(key);
  if (hit && now - hit.at < hit.ttl) return hit.holidays;
  for (const url of holidayApiUrls(year, cc)) {
    try {
      const holidays = normaliseHolidays(await fetchJson(url, fetchImpl));
      if (holidays.length) {
        cache.set(key, { at: now, ttl: OK_TTL_MS, holidays });
        return holidays;
      }
    } catch {
      // try the next source
    }
  }
  cache.set(key, { at: now, ttl: FAIL_TTL_MS, holidays: [] });
  return [];
}

/** Holidays from `fromDate` (YYYY-MM-DD) through the next `days` days. */
export async function upcomingHolidays(fromDate: string, days = 120, country = "US", fetchImpl: typeof fetch = fetch) {
  const year = Number(fromDate.slice(0, 4));
  const end = new Date(Date.parse(`${fromDate}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const years = Number(end.slice(0, 4)) > year ? [year, year + 1] : [year];
  const lists = await Promise.all(years.map((y) => publicHolidays(y, country, fetchImpl)));
  return lists.flat().filter((h) => h.date >= fromDate && h.date <= end);
}

/** Test hook. */
export function clearHolidayCache() {
  cache.clear();
}
