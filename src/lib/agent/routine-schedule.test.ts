import { describe, expect, it } from "vitest";
import { nextRunAfter, validateSchedule } from "./routine-schedule";

const iso = (d: Date) => d.toISOString();

describe("nextRunAfter (America/New_York)", () => {
  it("daily: later today if the time has not passed, otherwise tomorrow", () => {
    const s = { frequency: "daily", hour: 9, minute: 0 } as const;
    expect(iso(nextRunAfter(s, new Date("2026-10-31T12:00:00Z")))).toBe("2026-10-31T13:00:00.000Z"); // 8:00 ET -> 9:00 EDT
    expect(iso(nextRunAfter(s, new Date("2026-10-31T14:00:00Z")))).toBe("2026-11-01T14:00:00.000Z"); // DST ended: 9:00 EST
  });

  it("keeps the wall-clock hour across the November daylight-saving change", () => {
    const s = { frequency: "daily", hour: 9, minute: 30 } as const;
    expect(iso(nextRunAfter(s, new Date("2026-11-01T10:00:00Z")))).toBe("2026-11-01T14:30:00.000Z");
    expect(iso(nextRunAfter(s, new Date("2026-03-07T20:00:00Z")))).toBe("2026-03-08T13:30:00.000Z");
  });

  it("weekly: the next requested weekday", () => {
    // 2026-10-31 is a Saturday; Monday = 1.
    const s = { frequency: "weekly", weekday: 1, hour: 8, minute: 0 } as const;
    expect(iso(nextRunAfter(s, new Date("2026-10-31T20:00:00Z")))).toBe("2026-11-02T13:00:00.000Z");
  });

  it("monthly: the requested day, rolling to next month once passed", () => {
    const s = { frequency: "monthly", monthDay: 15, hour: 10, minute: 0 } as const;
    expect(iso(nextRunAfter(s, new Date("2026-10-31T20:00:00Z")))).toBe("2026-11-15T15:00:00.000Z");
    expect(iso(nextRunAfter(s, new Date("2026-11-01T00:00:00Z")))).toBe("2026-11-15T15:00:00.000Z");
  });

  it("is computed from now, so a long-missed slot yields one future time, not a backlog", () => {
    const s = { frequency: "daily", hour: 9, minute: 0 } as const;
    const next = nextRunAfter(s, new Date("2026-12-20T20:00:00Z"));
    expect(next.getTime()).toBeGreaterThan(new Date("2026-12-20T20:00:00Z").getTime());
    expect(iso(next)).toBe("2026-12-21T14:00:00.000Z");
  });

  it("rejects impossible schedules in plain words", () => {
    expect(validateSchedule({ frequency: "daily", hour: 24, minute: 0 })).toMatch(/hour/);
    expect(validateSchedule({ frequency: "weekly", hour: 9, minute: 0 })).toMatch(/day of the week/);
    expect(validateSchedule({ frequency: "monthly", monthDay: 31, hour: 9, minute: 0 })).toMatch(/1 and 28/);
    expect(() => nextRunAfter({ frequency: "daily", hour: 99, minute: 0 }, new Date())).toThrow();
  });
});
