import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CITY_DISTRICTS, type CitySnapshot, type CityWork } from "@/lib/ai-city";
import { CitySvgMap } from "./CitySvgMap";
import { CITY_2D_QUERY, CITY_ANIMATION_FPS, CITY_DPR_MAX, CITY_DPR_MIN, cityDprCeiling } from "./city-render";

const here = join(process.cwd(), "src/components/admin/city");
const source = (file: string) => readFileSync(join(here, file), "utf8");

const NOW = Date.parse("2026-11-02T18:00:00Z");
const row = (id: string, district: CityWork["district"], status: string, minutesAgo: number): CityWork => ({ id, district, status, title: id, source: "generation_jobs", at: new Date(NOW - minutesAgo * 60_000).toISOString() });
const SNAP: CitySnapshot = {
  checkedAt: "",
  sources: {
    jobs: { available: true, total: 1, truncated: false, rows: [row("a", "factory", "running", 2)] },
    approvals: { available: true, total: 1, truncated: false, rows: [row("b", "growth", "failed", 30)] },
    automations: { available: true, total: 0, truncated: false, rows: [] },
  },
};

describe("AI City render budget", () => {
  it("caps the pixel ratio to [1, 1.5]", () => {
    expect([CITY_DPR_MIN, CITY_DPR_MAX]).toEqual([1, 1.5]);
    expect(cityDprCeiling(3)).toBe(1.5);
    expect(cityDprCeiling(2)).toBe(1.5);
    expect(cityDprCeiling(1.25)).toBe(1.25);
    expect(cityDprCeiling(0.5)).toBe(1);
    expect(cityDprCeiling(undefined)).toBe(1);
    expect(cityDprCeiling(Number.NaN)).toBe(1);
  });

  it("renders on demand only, with a throttled clock while animating", () => {
    const scene = source("CityScene.tsx");
    expect(scene).toContain('frameloop="demand"');
    expect(scene).not.toMatch(/frameloop=\{[^}]*"always"/);
    expect(scene).toContain("dpr={[CITY_DPR_MIN, dpr]}");
    expect(scene).toMatch(/document\.hidden/);
    expect(CITY_ANIMATION_FPS).toBeLessThanOrEqual(30);
  });

  it("switches phones under 768px to the 2D map without loading the 3D scene", () => {
    const city = source("AiCity.tsx");
    expect(CITY_2D_QUERY).toBe("(max-width: 767px)");
    expect(city).toContain("window.matchMedia(CITY_2D_QUERY)");
    expect(city).toContain('const CityScene = lazy(() => import("./CityScene"))');
    // The lazy 3D scene is only mounted once the width check has said "not narrow".
    expect(city).toMatch(/flatMap \? <CitySvgMap[\s\S]*?: flatMap === false \? <SceneBoundary/);
  });
});

describe("CitySvgMap", () => {
  it("draws every district as a labelled button with its recorded state", () => {
    const html = renderToStaticMarkup(<CitySvgMap snapshot={SNAP} selected="growth" now={NOW} onSelect={() => undefined} />);
    for (const d of CITY_DISTRICTS) expect(html).toContain(`data-district="${d.id}"`);
    expect(html.match(/role="button"/g)?.length).toBe(CITY_DISTRICTS.length);
    expect(html.match(/tabindex="0"/g)?.length).toBe(CITY_DISTRICTS.length);
    expect(html).toContain('data-district="factory" data-state="working"');
    expect(html).toContain('data-district="growth" data-state="failed"');
    expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="Growth &amp; Sales Hub/);
    expect(html).toContain("Website Factory");
  });

  it("uses the city colour tokens, not new colours", () => {
    const map = source("CitySvgMap.tsx");
    expect(map).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(map).toMatch(/var\(--city-ground\)/);
  });

  it("keeps three.js out of the 2D map", () => {
    expect(source("CitySvgMap.tsx")).not.toMatch(/from\s+["'](three|@react-three)/);
  });
});
