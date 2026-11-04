import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const runJarvis = vi.fn();
vi.mock("./jarvis.functions", () => ({ runJarvis: (...args: unknown[]) => runJarvis(...args) }));

import { executeRoutine, ROUTINE_ALREADY_RUNNING, RoutineFellBackError, runDueJarvisRoutines, runJarvisRoutineNow, type JarvisRoutine } from "./jarvis-routines.server";

const now = new Date("2026-10-27T17:00:00Z");
function routine(overrides: Partial<JarvisRoutine> = {}): JarvisRoutine {
  return { id: "routine-1", user_id: "owner-1", name: "Daily briefing", prompt: "Review real operations.", frequency: "daily", hour: 8, minute: 0, enabled: true, last_run_at: null, last_status: null, last_summary: null, created_at: "2026-10-26T00:00:00Z", ...overrides };
}

/** In-memory model of the conditional updates; it never calls a hosted DB. */
function database(rows: JarvisRoutine[], options: { changeBeforeClaim?: boolean } = {}) {
  const updates: { patch: Record<string, unknown>; filters: Record<string, unknown> }[] = [];
  const messages: Record<string, unknown>[] = [];
  const db = {
    from: (table: string) => {
      let patch: Record<string, unknown> | undefined;
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        insert: async (value: Record<string, unknown>) => { messages.push({ table, ...value }); return { error: null }; },
        update: (value: Record<string, unknown>) => { patch = value; return query; },
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        is: (key: string, value: unknown) => { filters[key] = value; return query; },
        order: () => query,
        limit: async () => ({ data: rows.filter((row) => Object.entries(filters).every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value)).map((row) => ({ ...row })), error: null }),
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
          if (!patch) return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          updates.push({ patch, filters });
          if (patch["last_status"] === "running" && options.changeBeforeClaim && rows[0]) rows[0].last_run_at = "2026-10-27T16:59:00Z";
          const matches = rows.filter((row) => Object.entries(filters).every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value));
          for (const row of matches) Object.assign(row, patch);
          return Promise.resolve({ data: matches.map((row) => ({ id: row.id })), error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { db, updates, messages };
}

beforeEach(() => runJarvis.mockReset());

describe("routine runs report the AI's real outcome", () => {
  it("throws a safe error when Jarvis answered with the executive fallback", async () => {
    runJarvis.mockResolvedValue({ reply: "The live Lovable roster could not finish this turn.", fellBack: { category: "quota" } });
    const { db } = database([routine()]);
    const failure = await executeRoutine(db, routine()).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RoutineFellBackError);
    expect((failure as Error).message).toContain("quota");
    expect((failure as Error).message).not.toMatch(/key|sk-|Bearer/i);
  });

  it("returns the reply body when the model answered", async () => {
    runJarvis.mockResolvedValue({ reply: "Two builds are stuck in generating.", fellBack: null });
    const { db } = database([routine()]);
    await expect(executeRoutine(db, routine())).resolves.toBe("Two builds are stuck in generating.");
  });

  it("settles a scheduled run as error, not ok, when the reply was a fallback", async () => {
    runJarvis.mockResolvedValue({ reply: "The live Lovable roster could not finish this turn.", fellBack: { category: "rate_limited" } });
    const rows = [routine()];
    const { db } = database(rows);
    const result = await runDueJarvisRoutines(db, now);
    expect(result.results[0]?.ok).toBe(false);
    expect(rows[0]?.last_status).toBe("error");
    expect(rows[0]?.last_summary).toContain("rate_limited");
  });
});

describe("Run now uses the fenced claim and settlement", () => {
  it("claims, runs and settles ok on the claim it holds", async () => {
    const rows = [routine()];
    const { db, updates } = database(rows);
    const execute = vi.fn(async () => {
      expect(rows[0]?.last_status).toBe("running");
      return "Observed evidence";
    });
    await expect(runJarvisRoutineNow(db, "owner-1", "routine-1", execute, now)).resolves.toEqual({ status: "ok", summary: "Observed evidence" });
    expect(rows[0]).toMatchObject({ last_status: "ok", last_run_at: now.toISOString() });
    const settlement = updates.find((update) => update.patch["last_status"] === "ok");
    expect(settlement?.filters).toMatchObject({ user_id: "owner-1", last_status: "running", last_run_at: now.toISOString() });
    expect(settlement?.filters["last_summary"]).toMatch(/^Routine attempt /);
  });

  it("settles error when the run throws", async () => {
    const rows = [routine()];
    const { db } = database(rows);
    const execute = vi.fn(async () => { throw new Error("Reply unavailable"); });
    await expect(runJarvisRoutineNow(db, "owner-1", "routine-1", execute, now)).resolves.toEqual({ status: "error", summary: "Reply unavailable" });
    expect(rows[0]?.last_status).toBe("error");
  });

  it("settles error when Jarvis fell back", async () => {
    runJarvis.mockResolvedValue({ reply: "The live Lovable roster could not finish this turn.", fellBack: { category: "quota" } });
    const rows = [routine()];
    const { db } = database(rows);
    const result = await runJarvisRoutineNow(db, "owner-1", "routine-1", undefined, now);
    expect(result.status).toBe("error");
    expect(rows[0]?.last_status).toBe("error");
  });

  it("returns already running when another run takes the claim first", async () => {
    const rows = [routine()];
    const { db } = database(rows, { changeBeforeClaim: true });
    const execute = vi.fn(async () => "Should not run");
    await expect(runJarvisRoutineNow(db, "owner-1", "routine-1", execute, now)).resolves.toEqual({ status: "already_running", summary: ROUTINE_ALREADY_RUNNING });
    expect(execute).not.toHaveBeenCalled();
  });

  it("returns already running for a live running claim without dispatching", async () => {
    const rows = [routine({ last_status: "running", last_run_at: "2026-10-27T16:55:00Z" })];
    const { db, updates } = database(rows);
    const execute = vi.fn(async () => "Should not run");
    await expect(runJarvisRoutineNow(db, "owner-1", "routine-1", execute, now)).resolves.toMatchObject({ status: "already_running" });
    expect(execute).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });
});
