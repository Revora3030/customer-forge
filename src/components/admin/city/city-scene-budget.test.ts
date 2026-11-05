import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CITY_DISTRICTS } from "@/lib/ai-city";
import { CITY_DPR_MAX, CITY_DRAW_CALL_BUDGET, CITY_RAIN_MAX, estimateSceneDrawCalls } from "./city-render";

const source = (file: string) => readFileSync(join(process.cwd(), "src/components/admin/city", file), "utf8");
const D = CITY_DISTRICTS.length;

describe("AI City scene budget (JC-18)", () => {
  it("keeps the busiest possible scene at or under 150 draw calls", () => {
    expect(CITY_DRAW_CALL_BUDGET).toBe(150);
    const worst = estimateSceneDrawCalls({ districts: D, workingDistricts: D, approvalBeacons: D, rain: true, shadows: true });
    expect(worst).toBeLessThanOrEqual(CITY_DRAW_CALL_BUDGET);
    // A quiet city is cheaper, and the estimate never goes negative on bad input.
    expect(estimateSceneDrawCalls({ districts: D, workingDistricts: 0, approvalBeacons: 0, rain: false, shadows: true })).toBeLessThan(worst);
    expect(estimateSceneDrawCalls({ districts: -1, workingDistricts: 5, approvalBeacons: 5, rain: false, shadows: false })).toBe(1);
  });

  it("would break the budget if rain were one mesh per streak, which is why it is instanced", () => {
    const naive = estimateSceneDrawCalls({ districts: D, workingDistricts: D, approvalBeacons: D, rain: true, shadows: true }) + CITY_RAIN_MAX;
    expect(naive).toBeGreaterThan(CITY_DRAW_CALL_BUDGET - 1);
    const scene = source("CityScene.tsx");
    expect(scene).toContain("<instancedMesh");
    expect(scene).not.toMatch(/drops\.map\([^)]*\)\s*=>\s*\(?\s*<mesh/);
  });

  it("caps the pixel ratio at 1.5 and shows the readout only in development", () => {
    expect(CITY_DPR_MAX).toBe(1.5);
    const scene = source("CityScene.tsx");
    expect(scene).toContain("{import.meta.env.DEV ? <DevStats /> : null}");
    expect(scene).toContain("gl.info.render.calls");
    expect(scene).toContain("CITY_DRAW_CALL_BUDGET");
  });
});
