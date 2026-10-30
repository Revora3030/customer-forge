import { afterEach, describe, expect, it, vi } from "vitest";
import { checkBookingTime } from "./booking-hours";
import { dateChipDays } from "./date-chips";
import { closedOnHolidays, holidayClosureText, nextHoliday, normaliseHolidays } from "./holidays";
import { clearHolidayCache, holidayApiUrls, publicHolidays, upcomingHolidays } from "./holidays.server";

const V4 = [
  { date: "2026-11-26", name: "Thanksgiving Day", countryCode: "US", nationalHoliday: true, holidayTypes: ["Public"] },
  { date: "2026-02-12", name: "Lincoln's Birthday", nationalHoliday: false, holidayTypes: ["Observance"] },
  { date: "2026-12-25", name: "Christmas Day", nationalHoliday: true, holidayTypes: ["Public", "Bank"] },
];
const V3 = [{ date: "2026-07-03", localName: "Independence Day", name: "Independence Day", global: true, types: ["Public"] }];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => clearHolidayCache());

describe("normaliseHolidays", () => {
  it("keeps national public holidays from v4 and v3 shapes, sorted", () => {
    expect(normaliseHolidays(V4)).toEqual([
      { date: "2026-11-26", name: "Thanksgiving Day" },
      { date: "2026-12-25", name: "Christmas Day" },
    ]);
    expect(normaliseHolidays(V3)).toEqual([{ date: "2026-07-03", name: "Independence Day" }]);
    expect(normaliseHolidays({ error: true })).toEqual([]);
  });
});

describe("publicHolidays", () => {
  it("uses v4 first and caches the result", async () => {
    const fetcher = vi.fn(async (_url: string) => json(V4));
    expect(await publicHolidays(2026, "US", fetcher as never)).toHaveLength(2);
    await publicHolidays(2026, "US", fetcher as never);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toBe(holidayApiUrls(2026, "US")[0]);
  });

  it("falls back to v3 when v4 fails", async () => {
    const fetcher = vi.fn(async (url: string) => (url.includes("/v4/") ? json({}, 503) : json(V3)));
    expect(await publicHolidays(2026, "US", fetcher as never)).toEqual([{ date: "2026-07-03", name: "Independence Day" }]);
  });

  it("fails open to [] when both are down", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await publicHolidays(2026, "US", fetcher as never)).toEqual([]);
  });

  it("spans the year boundary for upcoming holidays", async () => {
    const fetcher = vi.fn(async (url: string) =>
      json(url.includes("2027") ? [{ date: "2027-01-01", name: "New Year's Day", nationalHoliday: true }] : V4),
    );
    const list = await upcomingHolidays("2026-12-01", 60, "US", fetcher as never);
    expect(list.map((h) => h.date)).toEqual(["2026-12-25", "2027-01-01"]);
  });
});

describe("holiday closures in booking", () => {
  const holidays = normaliseHolidays(V4);
  const base = { localDate: "2026-11-26", localTime: "10:00", durationMinutes: 60, holidays };

  it("refuses a holiday only when the owner opted in", () => {
    expect(checkBookingTime({ ...base, hours: { summary: "Mon-Fri 9am-5pm" } })).toEqual({ ok: true });
    const verdict = checkBookingTime({ ...base, hours: { summary: "Mon-Fri 9am-5pm", closed_on_holidays: true } });
    expect(verdict.ok).toBe(false);
    expect(!verdict.ok && verdict.reason).toContain("Thanksgiving Day");
  });

  it("fails open with no holiday data", () => {
    expect(checkBookingTime({ ...base, holidays: [], hours: { closed_on_holidays: true } })).toEqual({ ok: true });
    expect(checkBookingTime({ ...base, holidays: null, hours: { closed_on_holidays: true } })).toEqual({ ok: true });
  });

  it("marks holiday chips closed", () => {
    const chips = dateChipDays("2026-11-25", 3, { closed_on_holidays: true }, holidays);
    expect(chips.map((c) => c.closed)).toEqual([false, true, false]);
    expect(dateChipDays("2026-11-25", 3, {}, holidays).some((c) => c.closed)).toBe(false);
  });

  it("describes the next closure", () => {
    expect(closedOnHolidays({ closed_on_holidays: true })).toBe(true);
    expect(closedOnHolidays({ closed_on_holidays: "yes" })).toBe(false);
    const next = nextHoliday(holidays, "2026-11-27")!;
    expect(holidayClosureText(next)).toBe("Closed Friday, December 25 for Christmas Day");
  });
});
