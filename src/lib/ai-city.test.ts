import { describe, expect, it } from "vitest";
import { CITY_DISTRICTS, cityCommandDraft, districtState, workIsActive, type CitySnapshot, type CityWork } from "./ai-city";
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
  it("preserves approval restrictions in every mission draft", () => {
    for (const d of CITY_DISTRICTS) expect(cityCommandDraft(d.id)).toMatch(/approval/);
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
        in() { return builder; }, gte() { return builder; }, order() { return builder; }, limit() { return builder; },
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
    expect(fake.tables).toHaveLength(9);
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