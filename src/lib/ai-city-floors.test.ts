import { describe, expect, it } from "vitest";
import { CITY_DISTRICTS, districtCounts, type CitySnapshot, type CityWork } from "./ai-city";
import { districtFloors } from "./ai-city-floors";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const row = (
  id: string,
  status: string,
  minutes: number,
  extra: Partial<CityWork> = {},
): CityWork => ({
  id,
  district: "executive",
  title: id,
  status,
  at: ago(minutes),
  source: "jarvis_run_events",
  ...extra,
});
const src = (rows: CityWork[], available = true) => ({
  available,
  rows,
  total: available ? rows.length : null,
  truncated: false,
});
const snapshot = (sources: CitySnapshot["sources"]): CitySnapshot => ({
  checkedAt: ago(0),
  sources,
});

describe("JC-6 floors", () => {
  it("has no snapshot, no floors", () => {
    expect(districtFloors(undefined, "executive", NOW)).toBeNull();
  });

  it("makes one floor per work source of the district, from the recorded source", () => {
    const floors = districtFloors(
      snapshot({
        events: src([row("a", "running", 1), row("b", "failed", 30), row("c", "ok", 30)]),
        routines: src([row("r", "scheduled", 30, { source: "jarvis_routines" })]),
      }),
      "executive",
      NOW,
    )!;
    expect(floors.map((f) => f.key)).toEqual(["events", "routines"]);
    expect(floors[0]).toMatchObject({
      light: "failed",
      running: 1,
      queued: 0,
      failed: 1,
      records: 3,
      table: "jarvis_run_events",
    });
    expect(floors[1]).toMatchObject({
      light: "idle",
      running: 0,
      failed: 0,
      records: 1,
      table: "jarvis_routines",
    });
  });

  it("shows unavailable, never zero, when a source could not be read", () => {
    const floors = districtFloors(
      snapshot({ events: src([], false), routines: src([]) }),
      "executive",
      NOW,
    )!;
    expect(floors[0]).toMatchObject({
      light: "unavailable",
      running: null,
      queued: null,
      failed: null,
      records: null,
    });
    expect(floors[1]).toMatchObject({ light: "idle", running: 0, records: 0 });
  });

  it("a source missing from the snapshot is unavailable too", () => {
    expect(districtFloors(snapshot({}), "factory", NOW)![0]).toMatchObject({
      key: "jobs",
      light: "unavailable",
      records: null,
    });
  });

  it("floor counts add up to the district card", () => {
    const snap = snapshot({
      approvals: src([
        row("p1", "pending", 5, { district: "growth", source: "approval_queue" }),
        row("p2", "pending", 6, { district: "growth", source: "approval_queue" }),
      ]),
      automations: src([
        row("x", "failed", 5, { district: "growth", source: "automation_runs" }),
        row("y", "running", 1, { district: "growth", source: "automation_runs" }),
      ]),
    });
    const floors = districtFloors(snap, "growth", NOW)!;
    const card = districtCounts(snap, "growth", NOW)!;
    expect(floors.reduce((n, f) => n + (f.running ?? 0), 0)).toBe(card.running);
    expect(floors.reduce((n, f) => n + (f.queued ?? 0), 0)).toBe(card.queued);
    expect(floors.reduce((n, f) => n + (f.failed ?? 0), 0)).toBe(card.errors);
    expect(floors.find((f) => f.key === "approvals")?.light).toBe("waiting");
  });

  it("covers every district with at least one floor", () => {
    for (const d of CITY_DISTRICTS)
      expect(districtFloors(snapshot({}), d.id, NOW)!.length, d.id).toBeGreaterThan(0);
  });

  it("flags a truncated source", () => {
    const floors = districtFloors(
      snapshot({
        jobs: {
          ...src([row("j", "running", 1, { district: "factory", source: "generation_jobs" })]),
          truncated: true,
        },
      }),
      "factory",
      NOW,
    )!;
    expect(floors[0]?.truncated).toBe(true);
  });
});
