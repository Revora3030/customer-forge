import { describe, expect, it } from "vitest";
import { bookingCalendarEvent, bookingIcs, googleCalendarUrl, icsFileName } from "./booking-ics";

const input = {
  localDate: "2026-11-03",
  localTime: "14:30",
  durationMinutes: 90,
  businessName: "Oak City Plumbing",
  serviceName: "Water heater install",
  phone: "(919) 555-0134",
};

describe("bookingCalendarEvent", () => {
  it("builds a floating local start and end from the picked slot", () => {
    const event = bookingCalendarEvent(input)!;
    expect(event.start).toEqual([2026, 11, 3, 14, 30]);
    expect(event.end).toEqual([2026, 11, 3, 16, 0]);
    expect(event.title).toBe("Requested: Water heater install at Oak City Plumbing");
    expect(event.description).toContain("will confirm");
  });

  it("rolls the end over midnight and month end", () => {
    const event = bookingCalendarEvent({ ...input, localDate: "2026-10-31", localTime: "23:30", durationMinutes: 60 })!;
    expect(event.end).toEqual([2026, 11, 1, 0, 30]);
  });

  it("defaults odd durations to an hour and rejects bad dates", () => {
    expect(bookingCalendarEvent({ ...input, durationMinutes: 0 })?.durationMinutes).toBe(60);
    expect(bookingCalendarEvent({ ...input, localDate: "11/03/2026" })).toBeNull();
    expect(bookingCalendarEvent({ ...input, localTime: "25:00" })).toBeNull();
  });
});

describe("googleCalendarUrl", () => {
  it("uses floating times (no Z) so the slot keeps its wall-clock time", () => {
    const url = new URL(googleCalendarUrl(bookingCalendarEvent(input)!));
    expect(url.origin).toBe("https://calendar.google.com");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20261103T143000/20261103T160000");
  });
});

describe("bookingIcs", () => {
  it("writes a tentative VEVENT in floating local time", async () => {
    const ics = (await bookingIcs(bookingCalendarEvent(input)!))!;
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toMatch(/DTSTART:20261103T143000\r?\n/);
    expect(ics).toMatch(/DTEND:20261103T160000\r?\n/);
    expect(ics).toContain("STATUS:TENTATIVE");
    expect(ics).not.toMatch(/DTSTART:\d{8}T\d{6}Z/);
  });

  it("names the file after the date", () => {
    expect(icsFileName("2026-11-03")).toBe("appointment-2026-11-03.ics");
    expect(icsFileName("../evil")).toBe("appointment-request.ics");
  });
});

describe("requested, not confirmed (audit P2-03)", () => {
  it("starts every calendar title with 'Requested:'", () => {
    expect(bookingCalendarEvent(input)!.title.startsWith("Requested:")).toBe(true);
    expect(bookingCalendarEvent({ ...input, serviceName: null })!.title).toBe("Requested: appointment at Oak City Plumbing");
  });
  it("puts the same title in the .ics file", async () => {
    const ics = await bookingIcs(bookingCalendarEvent(input)!);
    expect(ics).toContain("SUMMARY:Requested: Water heater install at Oak City Plumbing");
  });
});
