import { describe, expect, it } from "vitest";
import { checkBookingTime, weeklyHoursFromSummary } from "@/lib/booking-hours";
import { openingHoursSpec } from "@/lib/site-head";

describe("opening hours typed in onboarding", () => {
  it("reads day ranges, single days and closed days", () => {
    const week = weeklyHoursFromSummary("Mon-Fri 8am-5pm, Sat 9-1, Sun closed");
    expect(week.mon).toBe("8am-5pm");
    expect(week.fri).toBe("8am-5pm");
    expect(week.sat).toBe("9-1");
    expect(week.sun).toBe("closed");
    expect(week.tue).toBe("8am-5pm");
  });

  it("reads weekdays/weekends/daily words and day lists", () => {
    expect(weeklyHoursFromSummary("Weekdays 9am to 6pm").wed).toBe("9am to 6pm");
    expect(weeklyHoursFromSummary("Daily 7am-7pm").sun).toBe("7am-7pm");
    const list = weeklyHoursFromSummary("Tue & Thu: 10am-4pm");
    expect(list.tue).toBe("10am-4pm");
    expect(list.thu).toBe("10am-4pm");
    expect(list.mon).toBeUndefined();
  });

  it("ignores text it cannot read rather than guessing", () => {
    expect(weeklyHoursFromSummary("By appointment")).toEqual({});
    expect(weeklyHoursFromSummary("")).toEqual({});
  });

  it("lets the booking check refuse a closed day from a summary", () => {
    const hours = { summary: "Mon-Fri 8am-5pm, Sun closed" };
    // 2026-10-04 is a Sunday; 2026-10-05 is a Monday.
    expect(checkBookingTime({ hours, localDate: "2026-10-04", localTime: "10:00", durationMinutes: 60 }).ok).toBe(false);
    expect(checkBookingTime({ hours, localDate: "2026-10-05", localTime: "10:00", durationMinutes: 60 }).ok).toBe(true);
    expect(checkBookingTime({ hours, localDate: "2026-10-05", localTime: "18:00", durationMinutes: 60 }).ok).toBe(false);
  });

  it("puts summary hours into the search listing data", () => {
    const spec = openingHoursSpec({ summary: "Mon-Fri 8am-5pm" });
    expect(spec).toHaveLength(5);
    expect(spec[0]).toMatchObject({ dayOfWeek: "Monday", opens: "08:00", closes: "17:00" });
  });
});
