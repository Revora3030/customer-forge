import { describe, expect, it } from "vitest";
import { CITY_DISTRICTS, districtState, workIsActive, type CitySnapshot, type CityWork } from "./ai-city";
import { collectCitySnapshot } from "./ai-city.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const now = Date.parse("2026-10-27T17:30:00Z");
const running: CityWork = { id: "1", title: "Build", district: "factory", status: "running", source: "generation_jobs", at: "2026-10-27T17:29:00Z" };
describe("AI City truthful workforce state", () => {
  it("represents all seven departments", () => {
    expect(CITY_DISTRICTS.map(d => d.id)).toEqual(["executive", "factory", "institute", "creative", "growth", "security", "knowledge"]);
  });
  it("animates only real running records with current heartbeats", () => {
    expect(workIsActive(running, now)).toBe(true);
    expect(workIsActive({ ...running, status: "queued" }, now)).toBe(false);
    expect(workIsActive({ ...running, status: "ok" }, now)).toBe(false);
    expect(workIsActive({ ...running, at: "2026-10-27T16:00:00Z" }, now)).toBe(false);
    expect(workIsActive({ ...running, at: "2026-10-27T18:00:00Z" }, now)).toBe(false);
  });
  it("does not show unreadable sources as idle or healthy", () => {
    const snapshot: CitySnapshot = { checkedAt: "", sources: { jobs: { available: false, rows: [], total: null, truncated: false } } };
    expect(districtState("factory", snapshot, now)).toBe("unavailable");
    expect(districtState("factory", undefined, now)).toBe("unavailable");
  });
});

describe("AI City data boundary", () => {
  function fakeDb(failTable?: string) {
    const filters: { table: string; column: string; value: unknown }[] = [];
    const tables: string[] = [];
    const db = { from(table: string) {
      tables.push(table);
      const builder = {
        select() { return builder; },
        eq(column: string, value: unknown) { filters.push({ table, column, value }); return builder; },
        in() { return builder; }, gte() { return builder; }, or() { return builder; }, neq() { return builder; }, order() { return builder; }, limit() { return builder; },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve(resolve({ data: table === "generation_jobs" ? [{ id: "1", organization_id: "tenant-a", status: "running", current_step: "Design", progress: 50, updated_at: "2026-10-27T17:29:00Z" }] : [], error: table === failTable ? { message: "denied" } : null, count: table === "generation_jobs" ? 200 : 0 })); },
      };
      return builder;
    } };
    return { db: db as unknown as SupabaseClient<Database>, filters, tables };
  }
  it("scopes private Jarvis events, routines and memory to the requesting owner", async () => {
    const fake = fakeDb();
    await collectCitySnapshot(fake.db, "owner-a");
    for (const table of ["jarvis_run_events", "jarvis_routines", "jarvis_memories"]) expect(fake.filters).toContainEqual({ table, column: "user_id", value: "owner-a" });
    expect(fake.filters).toContainEqual({ table: "ai_team_trace", column: "provider", value: "lovable" });
    expect(fake.filters).toContainEqual({ table: "error_events", column: "level", value: "error" });
    expect(fake.tables).toHaveLength(13);
  });
  it("preserves workspace identity and exact totals while declaring sample truncation", async () => {
    const fake = fakeDb();
    const result = await collectCitySnapshot(fake.db, "owner-a");
    expect(result.sources["jobs"]?.rows[0]?.organizationId).toBe("tenant-a");
    expect(result.sources["jobs"]?.total).toBe(200);
    expect(result.sources["jobs"]?.truncated).toBe(true);
  });
  it("keeps source errors unknown instead of silently zeroing counts", async () => {
    const result = await collectCitySnapshot(fakeDb("generation_jobs").db, "owner-a");
    expect(result.sources["jobs"]).toEqual({ available: false, rows: [], total: null, truncated: false });
    expect(result.sources["memories"]?.available).toBe(true);
  });
});
import { pipelineStages, salesMissionDraft, offerPriceSentence } from "./ai-city";
import { GROWTH_SYSTEM } from "./offer";
describe("AI City sales pipeline", () => {
  it("shows real counts for each stage in order", () => {
    const stages = pipelineStages({ found: 12, demoReady: 4, awaitingApproval: 2, sent: 3, replied: 1 });
    expect(stages.map(s => [s.label, s.display])).toEqual([["Found", "12"], ["Demo ready", "4"], ["Awaiting approval", "2"], ["Sent", "3"], ["Replied", "1"]]);
  });
  it("marks unreadable stages unavailable instead of zero", () => {
    expect(pipelineStages({ found: 0, demoReady: null, awaitingApproval: 0, sent: null, replied: 0 }).map(s => s.display)).toEqual(["0", "Unavailable", "0", "Unavailable", "0"]);
    expect(pipelineStages(undefined).every(s => s.display === "Unavailable")).toBe(true);
  });
  it("pitch drafts carry the official $350 setup / $100 monthly sentence", () => {
    expect(offerPriceSentence(GROWTH_SYSTEM)).toBe("$350 one-time setup, first month free, then $100/month.");
    expect(salesMissionDraft("pitch", GROWTH_SYSTEM)).toContain("$350 one-time setup, first month free, then $100/month.");
  });
  it("every sales mission requires approval before sending", () => {
    for (const kind of ["scout", "demo", "pitch"] as const) expect(salesMissionDraft(kind, GROWTH_SYSTEM)).toContain("Do not send, publish or spend without my explicit approval.");
    expect(salesMissionDraft("scout", GROWTH_SYSTEM)).toContain("OpenStreetMap");
  });
});

import { activityFeed, ageLabel, attentionItems, districtCounts, districtForKey, districtFromParam, hourlyBuckets, searchWork } from "./ai-city";

describe("AI City triage and activity", () => {
  const T = Date.parse("2026-10-27T18:00:00Z");
  const at = (minutesAgo: number) => new Date(T - minutesAgo * 60_000).toISOString();
  const row = (id: string, district: CityWork["district"], status: string, minutesAgo: number, extra: Partial<CityWork> = {}): CityWork => ({ id, title: `Record ${id}`, district, status, source: "generation_jobs", at: at(minutesAgo), ...extra });
  const snap: CitySnapshot = {
    checkedAt: "",
    sources: {
      jobs: { available: true, total: 4, truncated: false, rows: [row("a", "factory", "failed", 600), row("b", "factory", "running", 2), row("c", "factory", "queued", 300)] },
      approvals: { available: true, total: 2, truncated: false, rows: [row("d", "growth", "pending", 900, { title: "Pitch to Acme" }), row("e", "growth", "failed", 30)] },
      memories: { available: true, total: 1, truncated: false, rows: [row("f", "knowledge", "recorded", 10)] },
    },
  };

  it("ranks failures before waiting items and the longest-standing first", () => {
    const items = attentionItems(snap, T);
    expect(items.map((i) => i.row.id)).toEqual(["a", "e", "d", "c"]);
    expect(items.map((i) => i.kind)).toEqual(["failed", "failed", "waiting", "waiting"]);
    expect(attentionItems(snap, T, 2)).toHaveLength(2);
    expect(attentionItems(undefined, T)).toEqual([]);
  });

  it("counts running, queued and failed per district, and is null when nothing could be read", () => {
    expect(districtCounts(snap, "factory", T)).toEqual({ running: 1, queued: 1, errors: 1, total: 3 });
    expect(districtCounts(snap, "security", T)).toEqual({ running: 0, queued: 0, errors: 0, total: 0 });
    expect(districtCounts(undefined, "factory", T)).toBeNull();
  });

  it("buckets only recorded timestamps into the last day, oldest first", () => {
    const rows = [row("1", "factory", "ok", 10), row("2", "factory", "ok", 20), row("3", "factory", "ok", 90), row("4", "factory", "ok", 60 * 30), { ...row("5", "factory", "ok", 5), at: "garbage" }];
    const buckets = hourlyBuckets(rows, T, 24);
    expect(buckets).toHaveLength(24);
    expect(buckets[23]).toBe(2);
    expect(buckets[22]).toBe(1);
    expect(buckets.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("searches every recorded field and requires all terms", () => {
    const rows = [row("1", "growth", "pending", 1, { title: "Pitch to Acme", detail: "outreach" }), row("2", "factory", "ok", 1, { model: "openai/gpt-6.1-sol" })];
    expect(searchWork(rows, "acme outreach").map((r) => r.id)).toEqual(["1"]);
    expect(searchWork(rows, "SOL").map((r) => r.id)).toEqual(["2"]);
    expect(searchWork(rows, "acme sol")).toEqual([]);
    expect(searchWork(rows, "  ")).toHaveLength(2);
  });

  it("builds a newest-first cross-district feed that can be narrowed", () => {
    expect(activityFeed(snap).map((r) => r.id)).toEqual(["b", "f", "e", "c", "a", "d"]);
    expect(activityFeed(snap, { district: "growth" }).map((r) => r.id)).toEqual(["e", "d"]);
    expect(activityFeed(snap, { query: "pitch" }).map((r) => r.id)).toEqual(["d"]);
    expect(activityFeed(snap, { limit: 2 })).toHaveLength(2);
  });

  it("parses district links, labels ages and maps keys", () => {
    expect(districtFromParam("growth")).toBe("growth");
    expect(districtFromParam("nope")).toBeNull();
    expect(districtFromParam(undefined)).toBeNull();
    expect([0, 5 * 60_000, 3 * 3_600_000, 5 * 86_400_000].map(ageLabel)).toEqual(["now", "5m", "3h", "5d"]);
    expect(districtForKey("3", "executive")).toBe("institute");
    expect(districtForKey("8", "executive")).toBeNull();
    expect(districtForKey("ArrowRight", "knowledge")).toBe("executive");
    expect(districtForKey("ArrowLeft", "executive")).toBe("knowledge");
    expect(districtForKey("x", "executive")).toBeNull();
  });
});

import { CITY_MISSIONS, approveTap, missionsFor, pulseRate, runningFor } from "./ai-city";
import { JARVIS_DIAGNOSTIC_TOOLS } from "./jarvis-tool-registry";

describe("AI City mission presets", () => {
  const all = Object.values(CITY_MISSIONS).flat();
  const toolIds = new Set(JARVIS_DIAGNOSTIC_TOOLS.map((tool) => tool.id as string));

  it("gives every district at least one mission, and every id is unique", () => {
    for (const district of CITY_DISTRICTS) expect(missionsFor(district.id).length).toBeGreaterThan(0);
    expect(new Set(all.map((m) => m.id)).size).toBe(all.length);
  });

  it("only names read-only Jarvis tools that exist, so a renamed tool fails here instead of silently", () => {
    const named = all.flatMap((m) => m.draft.match(/\b(?:[a-z]+\.){1,2}[a-z-]+\b/g) ?? []).filter((word) => /^(website|platform|builder|release|ai|growth|security|domain|database|connectors|images|docs|jarvis|observability)\./.test(word));
    expect(named.length).toBeGreaterThan(8);
    for (const id of named) expect(toolIds.has(id), id).toBe(true);
  });

  it("states the approval gate in every draft and never asks for paid work, sends or publishing", () => {
    for (const mission of all) {
      expect(mission.draft, mission.id).toContain("do not spend, send or publish without my explicit approval");
      expect(mission.draft, mission.id).toMatch(/^\[AI City · /);
    }
  });
});

describe("AI City running time", () => {
  const T = Date.parse("2026-10-27T18:00:00Z");
  const base: CityWork = { id: "1", district: "factory", title: "Build", status: "running", source: "generation_jobs", at: "2026-10-27T17:59:00Z" };
  it("shows how long work has run only when its source recorded a start", () => {
    expect(runningFor({ ...base, startedAt: "2026-10-27T17:15:00Z" }, T)).toBe("45m");
    expect(runningFor(base, T)).toBeNull();
    expect(runningFor({ ...base, startedAt: "garbage" }, T)).toBeNull();
    expect(runningFor({ ...base, startedAt: "2026-10-27T19:00:00Z" }, T)).toBeNull();
  });
});

describe("AI City beacon pulse", () => {
  it("is calm unless a district needs attention, then follows the queue depth up to a cap", () => {
    const counts = (running: number, queued: number, errors: number) => ({ running, queued, errors, total: running + queued + errors });
    expect(pulseRate("working", counts(3, 0, 0))).toBe(2);
    expect(pulseRate("idle", null)).toBe(2);
    expect(pulseRate("attention", counts(0, 1, 0))).toBe(3.75);
    expect(pulseRate("attention", counts(0, 1, 0))).toBeLessThan(pulseRate("attention", counts(0, 2, 1)));
    expect(pulseRate("attention", counts(0, 50, 50))).toBe(6);
    expect(pulseRate("attention", null)).toBe(3.5);
  });
});

describe("AI City approve tap rule", () => {
  it("approves low-risk items on one tap and asks medium and high risk items for a second", () => {
    expect(approveTap("low", false)).toEqual({ armed: false, fire: true });
    expect(approveTap("medium", false)).toEqual({ armed: true, fire: false });
    expect(approveTap("medium", true)).toEqual({ armed: false, fire: true });
    expect(approveTap("high", false)).toEqual({ armed: true, fire: false });
    expect(approveTap("high", true)).toEqual({ armed: false, fire: true });
  });

  it("treats an unknown risk level as needing the second tap", () => {
    expect(approveTap("???", false)).toEqual({ armed: true, fire: false });
  });
});
