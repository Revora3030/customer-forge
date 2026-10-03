import { describe, expect, it } from "vitest";
import { checkBookingTime, parseClock, parseDayHours } from "./booking-hours";

describe("parseClock", () => {
  it("reads common clock formats", () => {
    expect(parseClock("9am")).toBe(540);
    expect(parseClock("9:30 pm")).toBe(21 * 60 + 30);
    expect(parseClock("17:00")).toBe(1020);
    expect(parseClock("12pm")).toBe(720);
    expect(parseClock("12am")).toBe(0);
    expect(parseClock("noon")).toBe(720);
    expect(parseClock("banana")).toBeNull();
  });
});

describe("parseDayHours", () => {
  it("reads ranges, closed days and unreadable text", () => {
    expect(parseDayHours("9am - 5pm")).toEqual({ closed: false, open: 540, close: 1020 });
    expect(parseDayHours("9-5")).toEqual({ closed: false, open: 540, close: 1020 });
    expect(parseDayHours("08:00 – 17:30")).toEqual({ closed: false, open: 480, close: 1050 });
    expect(parseDayHours("Closed")).toEqual({ closed: true });
    expect(parseDayHours("By appointment")).toBeNull();
  });
});

describe("checkBookingTime", () => {
  const hours = { monday: "9am-5pm", sunday: "Closed", saturday: "by appointment" };
  // 2026-10-05 is a Monday, 2026-10-04 a Sunday, 2026-10-03 a Saturday.
  it("accepts a slot inside opening hours", () => {
    expect(checkBookingTime({ hours, localDate: "2026-10-05", localTime: "10:00", durationMinutes: 60 }).ok).toBe(true);
  });
  it("refuses a closed day", () => {
    expect(checkBookingTime({ hours, localDate: "2026-10-04", localTime: "10:00", durationMinutes: 60 }).ok).toBe(false);
  });
  it("refuses a slot that runs past closing", () => {
    expect(checkBookingTime({ hours, localDate: "2026-10-05", localTime: "16:30", durationMinutes: 60 }).ok).toBe(false);
    expect(checkBookingTime({ hours, localDate: "2026-10-05", localTime: "07:00", durationMinutes: 30 }).ok).toBe(false);
  });
  it("never refuses on unreadable or missing hours", () => {
    expect(checkBookingTime({ hours, localDate: "2026-10-03", localTime: "22:00", durationMinutes: 60 }).ok).toBe(true);
    expect(checkBookingTime({ hours: {}, localDate: "2026-10-04", localTime: "03:00", durationMinutes: 60 }).ok).toBe(true);
    expect(checkBookingTime({ hours: null, localDate: "2026-10-04", localTime: "03:00", durationMinutes: 60 }).ok).toBe(true);
  });
  it("rejects malformed dates", () => {
    expect(checkBookingTime({ hours, localDate: "2026-02-31", localTime: "10:00", durationMinutes: 60 }).ok).toBe(false);
  });
});
