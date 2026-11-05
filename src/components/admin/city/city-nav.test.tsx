import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CITY_DISTRICTS, districtForKey, type CitySnapshot, type CityWork } from "@/lib/ai-city";
import { SHEET_HEIGHT_DVH } from "@/lib/city-nav";
import { CityMiniMap } from "./CityMiniMap";
import { CitySvgMap } from "./CitySvgMap";
import { DistrictCarousel } from "./DistrictCarousel";

const source = (file: string) => readFileSync(join(process.cwd(), "src/components/admin/city", file), "utf8");
const NOW = Date.parse("2026-11-05T12:00:00Z");
const row = (id: string, district: CityWork["district"], status: string, minutesAgo: number): CityWork => ({ id, district, status, title: id, source: "generation_jobs", at: new Date(NOW - minutesAgo * 60_000).toISOString() });
const SNAP: CitySnapshot = {
  checkedAt: "",
  sources: {
    jobs: { available: true, total: 1, truncated: false, rows: [row("a", "factory", "running", 2)] },
    approvals: { available: true, total: 1, truncated: false, rows: [row("b", "growth", "failed", 30)] },
    automations: { available: true, total: 0, truncated: false, rows: [] },
  },
};
const noop = () => undefined;

describe("CityMiniMap (JC-15)", () => {
  const html = renderToStaticMarkup(<CityMiniMap snapshot={SNAP} selected="factory" now={NOW} onSelect={noop} onOpen={noop} />);
  it("shows all 7 districts as buttons with a recorded state dot", () => {
    for (const d of CITY_DISTRICTS) expect(html).toContain(`data-district="${d.id}"`);
    expect(html.match(/<button/g)?.length).toBe(7);
    expect(html).toContain('data-district="factory" data-state="working"');
    expect(html).toContain('data-district="growth" data-state="failed"');
    expect(html).toContain('data-district="knowledge" data-state="unavailable"');
  });
  it("names each district and says what a tap does", () => {
    expect(html).toContain("Website Factory: 1 running");
    expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="Website Factory[^"]*Open it/);
    expect(html).toMatch(/aria-label="Growth &amp; Sales Hub[^"]*Fly there/);
  });
  it("numbers the dots like the 1-7 keys, which still switch district", () => {
    CITY_DISTRICTS.forEach((d, i) => expect(districtForKey(String(i + 1), "executive")).toBe(d.id));
    expect(html).toContain(">7</button>");
  });
  it("is mounted only beside the 3D scene and fits the desktop frame", () => {
    const city = source("AiCity.tsx");
    expect(city).toMatch(/flatMap === false \? <CityMiniMap[^>]*onSelect=\{setSelected\}[^>]*onOpen=\{openDistrict\}/);
    expect(html).toContain("hidden");
    expect(html).toContain("md:block");
  });
});

describe("mobile city (JC-60)", () => {
  it("the flat map starts framed with zoom, pan and reset controls that are 44px targets", () => {
    const html = renderToStaticMarkup(<CitySvgMap snapshot={SNAP} selected="growth" now={NOW} onSelect={noop} />);
    expect(html).toContain('viewBox="-8 -8 116 116"');
    expect(html).toContain('data-zoom="1.00"');
    for (const label of ["Zoom in", "Zoom out", "Reset map view"]) expect(html).toContain(`aria-label="${label}"`);
    expect(html.match(/min-h-11 min-w-11/g)?.length).toBe(3);
    expect(html).toContain("touch-none");
  });
  it("the map handles two-finger pinch and one-finger pan, and does not turn a drag into a tap", () => {
    const map = source("CitySvgMap.tsx");
    for (const needle of ["pinchZoom(", "zoomAbout(", "panBy(", "suppressClick", "onClickCapture"]) expect(map).toContain(needle);
  });
  it("the district carousel snaps and respects the bottom safe area", () => {
    const html = renderToStaticMarkup(<DistrictCarousel selected="growth" snapshot={SNAP} now={NOW} onSelect={noop} onOpen={noop} />);
    expect(html).toContain("snap-x snap-mandatory");
    expect(html).toContain("env(safe-area-inset-bottom)");
    expect(html.match(/min-h-14/g)?.length).toBe(7);
  });
  it("the inspector sheet opens at 80% height, follows a drag to dismiss and honours safe-area insets", () => {
    const sheet = source("DistrictInspector.tsx");
    expect(SHEET_HEIGHT_DVH).toBe(80);
    expect(sheet).toContain("SHEET_HEIGHT_DVH");
    expect(sheet).toContain("sheetDragResult(");
    expect(sheet).toContain('data-testid="district-sheet-handle"');
    expect(sheet).toContain("min-h-11 w-32");
    for (const inset of ["safe-area-inset-bottom", "safe-area-inset-left", "safe-area-inset-right"]) expect(sheet).toContain(inset);
    expect(sheet).not.toContain("h-[52dvh]");
  });
  it("the 3D scene's one-finger touch orbits, and two fingers pinch-zoom", () => {
    const scene = source("CityScene.tsx");
    expect(scene).toMatch(/ONE: THREE\.TOUCH\.ROTATE, TWO: THREE\.TOUCH\.DOLLY_PAN/);
  });
  it("the page keeps its main controls at 44px on phones", () => {
    const city = source("AiCity.tsx");
    expect(city.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(8);
  });
});
