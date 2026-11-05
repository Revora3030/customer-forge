import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CITY_DISTRICTS, districtCounts, type CitySnapshot, type CityWork } from "@/lib/ai-city";
import { activeRuns, districtCountRows, replayTableRows } from "@/lib/city-fallback";
import { replayMarkers } from "@/lib/city-replay";
import { CityOperationsTables } from "./CityOperationsTables";
import { CITY_FALLBACK_NOTE, cityFallbackReason, cityLowPower, webglAvailable } from "./city-render";

const NOW = Date.parse("2026-11-05T12:00:00Z");
const row = (id: string, district: CityWork["district"], status: string, minutesAgo: number, extra: Partial<CityWork> = {}): CityWork => ({ id, district, status, title: `Title ${id}`, source: "generation_jobs", at: new Date(NOW - minutesAgo * 60_000).toISOString(), ...extra });
const snap = (rows: CityWork[]): CitySnapshot => ({
  checkedAt: "",
  sources: {
    jobs: { available: true, total: rows.length, truncated: false, rows },
    approvals: { available: true, total: 0, truncated: false, rows: [] },
    automations: { available: true, total: 0, truncated: false, rows: [] },
    events: { available: true, total: 0, truncated: false, rows: [] },
    routines: { available: true, total: 0, truncated: false, rows: [] },
    traces: { available: true, total: 0, truncated: false, rows: [] },
    images: { available: true, total: 0, truncated: false, rows: [] },
    errors: { available: true, total: 0, truncated: false, rows: [] },
    memories: { available: true, total: 0, truncated: false, rows: [] },
  },
});
const running = (n: number) => Array.from({ length: n }, (_, i) => row(`run-${i}`, CITY_DISTRICTS[i % CITY_DISTRICTS.length]!.id, "running", 1 + i));

describe("Operations view parity with the scene (JC-17)", () => {
  it.each([0, 1, 5])("lists %i running rows when the scene would draw %i avatars", (n) => {
    const snapshot = snap(running(n));
    expect(activeRuns(snapshot, NOW)).toHaveLength(n);
    const html = renderToStaticMarkup(<CityOperationsTables snapshot={snapshot} now={NOW} onOpen={() => undefined} />);
    expect(html).toContain(`Running now (${n})`);
    for (let i = 0; i < n; i++) expect(html).toContain(`Title run-${i}`);
    if (n === 0) expect(html).toContain("Nothing is running right now.");
  });

  it("does not list finished, stale or duplicate rows as running", () => {
    const rows = [row("a", "factory", "running", 2), row("a", "factory", "running", 2), row("b", "factory", "completed", 2), row("c", "factory", "running", 45)];
    expect(activeRuns(snap(rows), NOW).map((r) => r.id)).toEqual(["a"]);
  });

  it("shows the same per-district counts as the scene", () => {
    const snapshot = snap([...running(4), row("f1", "security", "failed", 20), row("q1", "growth", "queued", 5)]);
    const rows = districtCountRows(snapshot, NOW);
    expect(rows).toHaveLength(CITY_DISTRICTS.length);
    for (const d of rows) expect(d.counts).toEqual(districtCounts(snapshot, d.id, NOW));
    const html = renderToStaticMarkup(<CityOperationsTables snapshot={snapshot} now={NOW} onOpen={() => undefined} />);
    for (const d of CITY_DISTRICTS) expect(html).toContain(d.name.replace("&", "&amp;"));
    expect(rows.reduce((sum, d) => sum + (d.counts?.running ?? 0), 0)).toBe(4);
  });

  it("lists exactly the replay scrubber's events as a table, newest first", () => {
    const snapshot = snap([row("f1", "security", "failed", 30), row("f2", "factory", "error", 600), row("ok", "factory", "completed", 10), row("old", "factory", "failed", 60 * 72)]);
    const markers = replayMarkers(snapshot, NOW);
    const table = replayTableRows(snapshot, NOW);
    expect(table.map((r) => r.row.id).sort()).toEqual(markers.map((m) => m.row.id).sort());
    expect(table.map((r) => r.row.id)).toEqual(["f1", "f2"]);
    const html = renderToStaticMarkup(<CityOperationsTables snapshot={snapshot} now={NOW} onOpen={() => undefined} />);
    expect(html).toContain("<table");
    expect(html).toContain("Replay events, last 48h");
    expect(html.indexOf("Title f1")).toBeLessThan(html.indexOf("Title f2"));
    expect(html).not.toContain("Title old");
  });

  it("says unavailable, never zero, when the records could not be read", () => {
    const html = renderToStaticMarkup(<CityOperationsTables snapshot={undefined} now={NOW} onOpen={() => undefined} />);
    expect(html).toContain("Running now (unavailable)");
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("Nothing is running right now.");
  });
});

describe("fallback detection (JC-17)", () => {
  it("flags data-saver and 2 GB devices as low power, and leaves ordinary devices alone", () => {
    expect(cityLowPower({ connection: { saveData: true } })).toBe(true);
    expect(cityLowPower({ deviceMemory: 2 })).toBe(true);
    expect(cityLowPower({ deviceMemory: 0.5 })).toBe(true);
    expect(cityLowPower({ deviceMemory: 8 })).toBe(false);
    expect(cityLowPower({})).toBe(false);
    expect(cityLowPower(undefined)).toBe(false);
  });

  it("puts a missing WebGL context ahead of low power, and never guesses when everything is fine", () => {
    expect(cityFallbackReason({ webgl: false, nav: { deviceMemory: 2 } })).toBe("no-webgl");
    expect(cityFallbackReason({ webgl: true, nav: { deviceMemory: 2 } })).toBe("low-power");
    expect(cityFallbackReason({ webgl: true, nav: { deviceMemory: 8 } })).toBeNull();
    expect(CITY_FALLBACK_NOTE["no-webgl"]).toMatch(/flat map/);
  });

  it("probes WebGL without throwing when the context is missing or the browser errors", () => {
    expect(webglAvailable(undefined)).toBe(false);
    expect(webglAvailable({ createElement: () => ({ getContext: () => null }) as unknown as HTMLElement })).toBe(false);
    expect(webglAvailable({ createElement: () => { throw new Error("blocked"); } })).toBe(false);
    let lost = false;
    const gl = { getExtension: () => ({ loseContext: () => { lost = true; } }) };
    expect(webglAvailable({ createElement: () => ({ getContext: () => gl }) as unknown as HTMLElement })).toBe(true);
    expect(lost).toBe(true);
  });
});
