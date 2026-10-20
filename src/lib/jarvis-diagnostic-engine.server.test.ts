import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { collectDemoEngineEvidence } from "./jarvis-diagnostic-engine.server";
import { DEMO_ENGINE_ROWS, scoreDemoEngine } from "./jarvis-capability-scorecard";

const NOW = new Date("2026-10-19T12:00:00.000Z");

type Result = { data?: unknown; error?: { message: string } | null; count?: number | null };
type Op = { method: string; args: unknown[] };

/** Answers each query from (table, filters); records nothing else. */
function fakeDb(answer: (table: string, ops: Op[]) => Result) {
  return {
    from(table: string) {
      const ops: Op[] = [];
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "gte", "is", "not", "order", "limit"]) builder[method] = (...args: unknown[]) => (ops.push({ method, args }), builder);
      builder["then"] = (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
        Promise.resolve({ data: null, error: null, count: null, ...answer(table, ops) }).then(resolve, reject);
      return builder;
    },
  } as unknown as SupabaseClient;
}

const has = (ops: Op[], method: string, value: unknown) => ops.some((op) => op.method === method && op.args.includes(value));

describe("demo engine self-audit", () => {
  it("has exactly the seven engine rows", () => {
    expect(DEMO_ENGINE_ROWS.map(([id]) => id)).toEqual(["acquisition", "enrichment", "gate", "outreach", "inbound", "engagement", "runtime"]);
    const empty = scoreDemoEngine({});
    expect(empty.total).toBe(7);
    expect(empty.score).toBe(0);
    expect(empty.rows.every((row) => row.status === "unknown")).toBe(true);
  });

  it("verifies rows only from live activity", async () => {
    const db = fakeDb((table, ops) => {
      if (table === "audit_logs") return { count: 4 };
      if (table === "prospect_autopilot_runs")
        return { data: [{ started_at: "2026-10-19T11:17:00.000Z", finished_at: "2026-10-19T11:19:00.000Z", found: 6, built: 2, emailed: 1, texted: 0, error: null }] };
      if (table === "website_settings")
        return { data: [{ generation: { prospectDemo: { kind: "prospect_demo", enrichment: { status: "verified" } } } }, { generation: { prospectDemo: { kind: "prospect_demo" } } }] };
      if (table === "prospect_outreach") {
        if (has(ops, "eq", "quality_gate")) return { count: 2 };
        if (has(ops, "eq", "sent")) return { count: 5 };
        if (has(ops, "eq", "failed")) return { count: 1 };
      }
      if (table === "prospect_inbound") return { count: has(ops, "in", "status") ? 2 : 3 };
      if (table === "prospect_preview_events") return ops.some((op) => op.method === "limit") ? { data: [{ created_at: "2026-10-19T10:00:00.000Z" }] } : { count: 12 };
      return {};
    });
    const audit = scoreDemoEngine(await collectDemoEngineEvidence(db, NOW), NOW.toISOString());
    expect(audit.rows.map((row) => `${row.id}:${row.status}`)).toEqual([
      "acquisition:verified", "enrichment:verified", "gate:verified", "outreach:verified", "inbound:verified", "engagement:verified", "runtime:verified",
    ]);
    expect(audit.score).toBe(10);
    expect(audit.rows.find((row) => row.id === "outreach")?.metrics).toEqual({ sent: 5, failed: 1 });
  });

  it("reports missing tables as unknown and failures as failed, never as passes", async () => {
    const db = fakeDb((table, ops) => {
      if (table === "prospect_inbound" || table === "prospect_preview_events") return { error: { message: 'relation "x" does not exist' } };
      if (table === "prospect_autopilot_runs") return { data: [{ started_at: "2026-10-19T09:00:00.000Z", finished_at: null, found: 0, built: 0, emailed: 0, texted: 0, error: null }] };
      if (table === "prospect_outreach") return { count: has(ops, "eq", "failed") ? 3 : 0 };
      if (table === "website_settings") return { data: [] };
      return { count: 0 };
    });
    const audit = scoreDemoEngine(await collectDemoEngineEvidence(db, NOW), NOW.toISOString());
    const status = Object.fromEntries(audit.rows.map((row) => [row.id, row.status]));
    expect(status).toMatchObject({ inbound: "unknown", engagement: "unknown", outreach: "failed", runtime: "failed", gate: "configured", acquisition: "configured", enrichment: "unknown" });
    expect(audit.verified).toBe(0);
  });

  it("counts only finished replies as handled, not claimed or drafted ones", async () => {
    // Three replies: one being processed and two awaiting the operator. Each has handled_at set by its claim or draft.
    const inbound = [
      { status: "processing", handled_at: "2026-10-19T11:00:00.000Z" },
      { status: "awaiting_operator", handled_at: "2026-10-19T11:01:00.000Z" },
      { status: "awaiting_operator", handled_at: "2026-10-19T11:02:00.000Z" },
    ];
    const queries: Op[][] = [];
    const db = fakeDb((table, ops) => {
      if (table !== "prospect_inbound") return {};
      queries.push(ops);
      const statusIn = ops.find((op) => op.method === "in" && op.args[0] === "status")?.args[1] as string[] | undefined;
      const handledAtSet = ops.some((op) => op.method === "not" && op.args[0] === "handled_at");
      return { count: inbound.filter((row) => (!statusIn || statusIn.includes(row.status)) && (!handledAtSet || row.handled_at != null)).length };
    });
    const audit = scoreDemoEngine(await collectDemoEngineEvidence(db, NOW), NOW.toISOString());
    const row = audit.rows.find((item) => item.id === "inbound");
    expect(row?.status).toBe("failed");
    expect(row?.metrics).toEqual({ replies: 3, handled: 0 });
    expect(queries.some((ops) => ops.some((op) => op.method === "in" && JSON.stringify(op.args) === JSON.stringify(["status", ["handled", "dismissed"]])))).toBe(true);
  });

  it("survives a client that can't query at all", async () => {
    const audit = scoreDemoEngine(await collectDemoEngineEvidence({} as SupabaseClient, NOW));
    expect(audit.rows.every((row) => row.status === "unknown")).toBe(true);
  });
});
