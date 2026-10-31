import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/maps-photos.server", () => ({ attachMapsPhotos: vi.fn(async () => undefined) }));
import { attachMapsPhotos } from "@/lib/maps-photos.server";
import { startDeferredDemoBuild } from "@/lib/jarvis-demo-site.server";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Small in-memory PostgREST stand-in: select / eq / limit / insert / update. */
function database(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = { ...seed };
  const db = {
    from(table: string) {
      const rows = (tables[table] ??= []);
      const predicates: Array<(row: Row) => boolean> = [];
      let mode: "select" | "update" | "insert" = "select";
      let value: Row = {};
      let limit = Infinity;
      const run = () => {
        if (mode === "insert") {
          const row = { id: `${table}-${rows.length + 1}`, ...value };
          rows.push(row);
          return { data: [{ ...row }], error: null };
        }
        const selected = rows.filter((row) => predicates.every((p) => p(row))).slice(0, limit);
        if (mode === "update") selected.forEach((row) => Object.assign(row, value));
        return { data: selected.map((row) => ({ ...row })), error: null };
      };
      const query = {
        select: () => query,
        insert: (next: Row) => { mode = "insert"; value = next; return query; },
        update: (next: Row) => { mode = "update"; value = next; return query; },
        eq: (key: string, expected: unknown) => { predicates.push((row) => row[key] === expected); return query; },
        in: (key: string, expected: unknown[]) => { predicates.push((row) => expected.includes(row[key])); return query; },
        order: () => query,
        limit: (count: number) => { limit = count; return query; },
        maybeSingle: async () => ({ ...run(), data: run().data[0] ?? null }),
        single: async () => { const r = run(); return { ...r, data: r.data[0] ?? null }; },
        then: (resolve: (result: unknown) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
      };
      return query;
    },
  };
  return { db: db as never, tables };
}

const shell = (marker: Row = {}) => ({
  website_settings: [{ organization_id: "o1", generation: { prospectDemo: { kind: "prospect_demo", createdBy: "admin", placeId: "ChIJabc", pitchFirst: true, ...marker } } }],
  organizations: [{ id: "o1", name: "Shell Detail" }],
});

describe("startDeferredDemoBuild", () => {
  it.each(["failed", "cancelled"])("does not let a historical %s attempt block a replied pitch shell", async (status) => {
    const { db, tables } = database({ ...shell({ placeId: "osm:node:1" }), generation_jobs: [{ organization_id: "o1", status }] });
    expect(await startDeferredDemoBuild(db, "o1")).toBeTruthy();
    expect(tables["generation_jobs"]).toHaveLength(2);
  });
  it.each(["processing", "running", "completed"])("does not restart a %s demo", async (status) => {
    const { db, tables } = database({ ...shell(), generation_jobs: [{ organization_id: "o1", status }] });
    expect(await startDeferredDemoBuild(db, "o1")).toBeNull();
    expect(tables["generation_jobs"]).toHaveLength(1);
  });
  it("refuses placeholder business facts before queueing, and says why", async () => {
    const { db, tables } = database({
      ...shell(),
      organizations: [{ id: "o1", name: "Your Business Name" }],
      business_profiles: [{ organization_id: "o1", city: "Destin", service_area: "Destin", description: null }],
      services: [{ organization_id: "o1", name: "Jet ski rentals", is_active: true }],
    });
    await expect(startDeferredDemoBuild(db, "o1")).rejects.toThrow(/business name/i);
    expect(tables["generation_jobs"] ?? []).toHaveLength(0);
    expect(tables["audit_logs"]?.[0]).toMatchObject({ action: "jarvis.prospect_pitch.build_refused" });
  });
  it("queues a real business whose city is also its service area", async () => {
    const { db, tables } = database({
      ...shell(),
      organizations: [{ id: "o1", name: "Blue Harbor Jet Ski Rentals" }],
      business_profiles: [{ organization_id: "o1", city: "Destin", service_area: "Destin", description: null }],
      services: [{ organization_id: "o1", name: "Jet ski rentals", is_active: true }],
    });
    expect(await startDeferredDemoBuild(db, "o1")).toBeTruthy();
    expect(tables["generation_jobs"]).toHaveLength(1);
  });
  it("queues the build once for an unbuilt pitch shell and clears the flag", async () => {
    const { db, tables } = database(shell());
    const jobId = await startDeferredDemoBuild(db, "o1");
    expect(jobId).toBeTruthy();
    expect(tables["generation_jobs"]![0]).toMatchObject({ organization_id: "o1", status: "queued", created_by: "admin" });
    const marker = (tables["website_settings"]![0]!["generation"] as Row)["prospectDemo"];
    expect(marker).toMatchObject({ pitchFirst: false, kind: "prospect_demo" });
    expect(typeof marker["pitchAnsweredAt"]).toBe("string");
    expect(attachMapsPhotos).toHaveBeenCalledWith(db, "o1", "Shell Detail", "ChIJabc");
    // A second reply does nothing.
    expect(await startDeferredDemoBuild(db, "o1")).toBeNull();
    expect(tables["generation_jobs"]).toHaveLength(1);
  });

  it("does nothing for an ordinary demo, a claimed shell, or a shell that already has a job", async () => {
    const cases: Array<[Record<string, Row[]>, string]> = [
      [shell({ pitchFirst: false }), "ordinary"],
      [shell({ claimedAt: "2026-10-18T00:00:00Z" }), "claimed"],
      [{ ...shell(), generation_jobs: [{ organization_id: "o1", status: "queued" }] }, "has job"],
    ];
    for (const [seed, label] of cases) {
      const { db, tables } = database(seed);
      expect(await startDeferredDemoBuild(db, "o1"), label).toBeNull();
      expect(tables["generation_jobs"] ?? [], label).toHaveLength(label === "has job" ? 1 : 0);
    }
  });
});

describe("reply wiring", () => {
  const source = readFileSync(resolve(__dirname, "prospect-replies.server.ts"), "utf8");

  it("builds the demo only for a real reply with a positive, price or question intent", () => {
    expect(source).toMatch(/else if \(!message\.autoSubmitted\) \{[\s\S]*AUTO_REPLY_INTENTS\.has\(classification\.intent\)[\s\S]*startDeferredDemoBuild/);
  });

  it("never sends an automatic answer while a pitch prospect has no finished preview", () => {
    expect(source).toContain("available: !demo.claimed && !demo.pitchPending");
  });
});
