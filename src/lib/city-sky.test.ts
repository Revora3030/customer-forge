import { describe, expect, it } from "vitest";
import type { CitySnapshot, CityWork } from "@/lib/ai-city";
import {
  cityHealthWindow,
  cityLoadNow,
  hourlyRunningQueued,
  median,
  atmosphereFromSignals,
  skyFromLoad,
  skyLighting,
  weatherFromHealth,
} from "@/lib/city-sky";

const now = Date.parse("2026-11-05T12:00:00Z");

function row(partial: Partial<CityWork> & Pick<CityWork, "id" | "status" | "at">): CityWork {
  return {
    title: "Job",
    district: "factory",
    source: "generation_jobs",
    ...partial,
  };
}

describe("JC-9 load → sky", () => {
  it("median of an empty list is unknown, not zero", () => {
    expect(median([])).toBeNull();
    expect(median([2, 4, 6])).toBe(4);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("stays neutral when the snapshot was not loaded", () => {
    expect(cityLoadNow(undefined, now)).toBeNull();
    expect(skyFromLoad({ currentLoad: null, hourlyLoads: null, openFailures: null })).toMatchObject({
      mode: "neutral",
      label: expect.stringContaining("no load data"),
    });
  });

  it("maps quiet load to dusk and busy load to bright", () => {
    expect(skyFromLoad({ currentLoad: 1, hourlyLoads: [2, 2, 2, 4], openFailures: 0 }).mode).toBe("dusk");
    expect(skyFromLoad({ currentLoad: 5, hourlyLoads: [2, 2, 2, 4], openFailures: 0 }).mode).toBe("bright");
  });

  it("amber haze wins when open failures were measured", () => {
    const sky = skyFromLoad({ currentLoad: 0, hourlyLoads: [0, 0, 1], openFailures: 3 });
    expect(sky.mode).toBe("amber");
    expect(sky.label).toContain("3 open failure");
  });

  it("counts only running and waiting rows into the hourly load series", () => {
    const rows = [
      row({ id: "1", status: "running", at: "2026-11-05T11:30:00Z" }),
      row({ id: "2", status: "queued", at: "2026-11-05T11:10:00Z" }),
      row({ id: "3", status: "ok", at: "2026-11-05T11:05:00Z" }),
      row({ id: "4", status: "failed", at: "2026-11-05T10:05:00Z" }),
    ];
    const hours = hourlyRunningQueued(rows, now, 3);
    expect(hours).toEqual([0, 0, 2]);
  });

  it("sums running+queued across districts when the snapshot is present", () => {
    const snapshot: CitySnapshot = {
      checkedAt: "",
      sources: {
        jobs: {
          available: true,
          total: 2,
          truncated: false,
          rows: [
            row({ id: "a", status: "running", at: "2026-11-05T11:55:00Z", district: "factory" }),
            row({ id: "b", status: "queued", at: "2026-11-05T11:50:00Z", district: "growth" }),
          ],
        },
      },
    };
    expect(cityLoadNow(snapshot, now)).toBe(2);
  });
});

describe("JC-10 weather = health", () => {
  it("is unknown until both failure and window counts exist", () => {
    expect(weatherFromHealth({ openFailures: null, recentWork: null }).kind).toBe("unknown");
    expect(weatherFromHealth({ openFailures: 0, recentWork: null }).kind).toBe("unknown");
  });

  it("is clear only when open failures were measured as zero", () => {
    expect(weatherFromHealth({ openFailures: 0, recentWork: 12 })).toMatchObject({ kind: "clear", density: 0 });
  });

  it("sets rain density from the measured failure rate, never inventing failures", () => {
    const weather = weatherFromHealth({ openFailures: 2, recentWork: 8 });
    expect(weather.kind).toBe("rain");
    expect(weather.density).toBe(0.25);
    expect(weather.label).toContain("2 open failure");
  });

  it("reads open failures from grouped failure counts on the snapshot", () => {
    const snapshot: CitySnapshot = {
      checkedAt: "",
      sources: {
        jobs: {
          available: true,
          total: 2,
          truncated: false,
          rows: [
            row({ id: "f1", status: "failed", at: "2026-11-05T10:00:00Z", title: "Build A" }),
            row({ id: "f2", status: "failed", at: "2026-11-05T09:00:00Z", title: "Build A" }),
            row({ id: "ok", status: "ok", at: "2026-11-05T11:00:00Z", title: "Build B" }),
          ],
        },
      },
    };
    expect(cityHealthWindow(snapshot, now)).toEqual({ openFailures: 2, recentWork: 3 });
    expect(cityHealthWindow(undefined, now)).toEqual({ openFailures: null, recentWork: null });
  });
});

describe("sky lighting", () => {
  it("keeps the token ground colour for the neutral / no-data state", () => {
    expect(skyLighting("neutral", "#0b1220").background).toBe("#0b1220");
    expect(skyLighting("dusk", "#0b1220").ambient).toBeLessThan(skyLighting("bright", "#0b1220").ambient);
  });
});

describe("atmosphereFromSignals (JC-7/8 scrubber contract)", () => {
  it("is a pure function of the supplied load/health signals", () => {
    const a = atmosphereFromSignals({ currentLoad: 1, hourlyLoads: [4, 4, 4], openFailures: 0, recentWork: 10 });
    const b = atmosphereFromSignals({ currentLoad: 1, hourlyLoads: [4, 4, 4], openFailures: 0, recentWork: 10 });
    expect(a).toEqual(b);
    expect(a.sky.mode).toBe("dusk");
    expect(a.weather.kind).toBe("clear");
    const rain = atmosphereFromSignals({ currentLoad: 9, hourlyLoads: [1, 1, 1], openFailures: 2, recentWork: 4 });
    expect(rain.sky.mode).toBe("amber");
    expect(rain.weather.kind).toBe("rain");
    expect(rain.weather.density).toBe(0.5);
  });
});
