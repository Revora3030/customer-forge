import { describe, expect, it } from "vitest";
import { CITY_DISTRICTS, CITY_MISSIONS, GATE, type CitySnapshot, type CityWork } from "./ai-city";
import { tapActions } from "./city-tap-actions";

const NOW = Date.parse("2026-11-05T05:00:00Z");
const row = (id: string, status: string, minutesAgo: number): CityWork => ({ id, district: "factory", status, title: "Layout rescue", source: "generation_jobs", detail: "timeout", at: new Date(NOW - minutesAgo * 60_000).toISOString() });
const allAvailable = (rows: CityWork[]): CitySnapshot => ({ checkedAt: "", sources: Object.fromEntries(["events", "routines", "jobs", "traces", "images", "approvals", "automations", "errors", "memories"].map((k) => [k, { available: true, total: k === "jobs" ? rows.length : 0, truncated: false, rows: k === "jobs" ? rows : [] }])) });

describe("tapActions (JC-12)", () => {
  it("offers Brief me, Run the check, Open the page and Ask Jarvis for every district", () => {
    for (const d of CITY_DISTRICTS) {
      const actions = tapActions(d.id, undefined, NOW);
      expect(actions.map((a) => a.id)).toEqual(["brief", "check", "open", "ask"]);
    }
  });

  it("every draft is read-only, carries GATE and comes from an existing AI City draft", () => {
    for (const d of CITY_DISTRICTS) {
      for (const a of tapActions(d.id, undefined, NOW)) {
        if (a.kind === "link") { expect(a.to).toBe(d.route); continue; }
        expect(a.draft).toContain(GATE);
        expect(a.draft.startsWith("[AI City")).toBe(true);
        if (a.source.startsWith("CITY_MISSIONS.")) expect(CITY_MISSIONS[d.id].some((m) => m.draft === a.draft)).toBe(true);
      }
    }
  });

  it("Brief me is the district's first mission; Run the check prefers a check mission", () => {
    const sec = tapActions("security", undefined, NOW);
    expect(sec[0]).toMatchObject({ source: "CITY_MISSIONS.security.accessibility" });
    const factory = tapActions("factory", undefined, NOW);
    expect(factory[1]).toMatchObject({ source: "CITY_MISSIONS.factory.homepage-browser" });
  });

  it("Run the check becomes the triageDraft when the district has a recent failure", () => {
    const check = tapActions("factory", allAvailable([row("a", "failed", 30)]), NOW)[1];
    expect(check).toMatchObject({ id: "check", source: "triageDraft" });
    if (check?.kind === "draft") { expect(check.draft).toContain("[AI City · Triage]"); expect(check.draft).toContain(GATE); }
  });
});
