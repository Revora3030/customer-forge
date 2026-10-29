import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { claimIsStranded, INTERRUPTED_SUMMARY, runDueJarvisRoutines, type JarvisRoutine } from "./jarvis-routines.server";

const now = new Date("2026-10-27T17:00:00Z");
function routine(id = "routine-1"): JarvisRoutine {
  return { id, user_id: "owner-1", name: "Daily briefing", prompt: "Review real operations.", frequency: "daily", hour: 8, minute: 0, enabled: true, last_run_at: null, last_status: null, last_summary: null, created_at: "2026-10-26T00:00:00Z" };
}

/** Shared state models an atomic conditional update; it never calls a hosted DB. */
function database(rows = [routine()], options: { claimError?: boolean; settleError?: boolean; loseSettlement?: boolean; changeBeforeClaim?: boolean; wrongClaim?: boolean } = {}) {
  const updates: { patch: Record<string, unknown>; filters: Record<string, unknown> }[] = [];
  const db = {
    from: () => {
      let patch: Record<string, unknown> | undefined;
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        update: (value: Record<string, unknown>) => { patch = value; return query; },
        eq: (key: string, value: unknown) => { filters[key] = value; return query; },
        is: (key: string, value: unknown) => { filters[key] = value; return query; },
        limit: async () => ({ data: rows.filter(r => r.enabled).map(r => ({ ...r })), error: null }),
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
          if (!patch) return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          updates.push({ patch, filters });
          const claiming = patch["last_status"] === "running";
          if (claiming && options.changeBeforeClaim && rows[0]) rows[0].prompt = "An edited owner request.";
          if ((claiming && options.claimError) || (!claiming && options.settleError)) return Promise.resolve({ data: null, error: { message: "database unavailable" } }).then(resolve, reject);
          if (!claiming && options.loseSettlement) return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          const matches = rows.filter(row => Object.entries(filters).every(([key, value]) => (row as unknown as Record<string, unknown>)[key] === value));
          for (const row of matches) Object.assign(row, patch);
          return Promise.resolve({ data: matches.map(r => ({ id: options.wrongClaim && claiming ? "foreign-row" : r.id })), error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { db, rows, updates };
}

describe("scheduled routine atomic claims", () => {
  it("dispatches only once across overlapping passes and consumes the local day before work", async () => {
    const { db, rows, updates } = database();
    const execute = vi.fn(async () => {
      expect(rows[0]?.last_run_at).toBe(now.toISOString());
      expect(rows[0]?.last_status).toBe("running");
      return "Observed evidence";
    });
    const results = await Promise.all([runDueJarvisRoutines(db, now, execute), runDueJarvisRoutines(db, now, execute)]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(results.reduce((sum, r) => sum + r.ran, 0)).toBe(1);
    expect((await runDueJarvisRoutines(db, now, execute)).ran).toBe(0);
    expect(rows[0]?.last_status).toBe("ok");
    const settlement = updates.find(u => u.patch["last_status"] === "ok");
    expect(settlement?.filters["user_id"]).toBe("owner-1");
    expect(settlement?.filters["last_status"]).toBe("running");
    expect(settlement?.filters["last_summary"]).toMatch(/^Routine attempt /);
    expect(settlement?.patch).not.toHaveProperty("last_run_at");
  });

  it.each([{ claimError: true }, { wrongClaim: true }])("fails closed on unverified claim %j", async options => {
    const { db } = database(undefined, options);
    const execute = vi.fn(async () => "Should not run");
    await expect(runDueJarvisRoutines(db, now, execute)).rejects.toThrow(/claim/);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects an owner edit between discovery and claim", async () => {
    const { db } = database(undefined, { changeBeforeClaim: true });
    const execute = vi.fn(async () => "Should not run");
    expect((await runDueJarvisRoutines(db, now, execute)).ran).toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it("consumes failures without a same-day retry", async () => {
    const { db, rows } = database();
    const execute = vi.fn(async () => { throw new Error("Reply unavailable"); });
    const result = await runDueJarvisRoutines(db, now, execute);
    expect(result.results[0]?.ok).toBe(false);
    expect(rows[0]?.last_status).toBe("error");
    await runDueJarvisRoutines(db, now, execute);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it.each([{ settleError: true }, { loseSettlement: true }])("does not redispatch uncertain settlement %j, even the next day", async options => {
    const { db, rows } = database(undefined, options);
    const execute = vi.fn(async () => "Observed evidence");
    const result = await runDueJarvisRoutines(db, now, execute);
    expect(result.results[0]?.ok).toBe(false);
    expect(result.results[0]?.detail).toContain("unconfirmed");
    expect(rows[0]?.last_status).toBe("running");
    await runDueJarvisRoutines(db, new Date("2026-10-28T17:00:00Z"), execute);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("limits a pass to three dispatched routines", async () => {
    const { db } = database(Array.from({ length: 5 }, (_, index) => routine(`routine-${index}`)));
    const execute = vi.fn(async () => "Observed evidence");
    expect((await runDueJarvisRoutines(db, now, execute)).ran).toBe(3);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  describe("a claim whose run was stopped by the server", () => {
    const running = (claimedAt: string) => ({ ...routine(), last_status: "running", last_run_at: claimedAt, last_summary: "Routine attempt a8af6344; completion not yet confirmed." });

    it("is settled as interrupted and not run again the same day", async () => {
      const { db, rows } = database([running("2026-10-27T16:00:00Z")]);
      const execute = vi.fn(async () => "Observed evidence");
      expect((await runDueJarvisRoutines(db, now, execute)).ran).toBe(0);
      expect(execute).not.toHaveBeenCalled();
      expect(rows[0]).toMatchObject({ last_status: "error", last_summary: INTERRUPTED_SUMMARY });
    });

    it("runs again on its next day instead of staying stuck", async () => {
      const { db, rows } = database([running("2026-10-26T17:00:00Z")]);
      const execute = vi.fn(async () => "Observed evidence");
      expect((await runDueJarvisRoutines(db, now, execute)).ran).toBe(1);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(rows[0]?.last_status).toBe("ok");
    });

    it("leaves a run that started minutes ago alone", async () => {
      const { db, rows } = database([running("2026-10-27T16:55:00Z")]);
      const execute = vi.fn(async () => "Observed evidence");
      expect((await runDueJarvisRoutines(db, now, execute)).ran).toBe(0);
      expect(execute).not.toHaveBeenCalled();
      expect(rows[0]?.last_status).toBe("running");
    });

    it("is told apart from a finished or unclaimed routine", () => {
      expect(claimIsStranded({ last_status: "running", last_run_at: "2026-10-27T16:00:00Z" }, now)).toBe(true);
      expect(claimIsStranded({ last_status: "running", last_run_at: "2026-10-27T16:55:00Z" }, now)).toBe(false);
      expect(claimIsStranded({ last_status: "ok", last_run_at: "2026-10-27T16:00:00Z" }, now)).toBe(false);
      expect(claimIsStranded({ last_status: "running", last_run_at: null }, now)).toBe(false);
    });
  });

  it("allows a settled daily routine on its next eligible day", async () => {
    const { db } = database();
    const execute = vi.fn(async () => "Observed evidence");
    await runDueJarvisRoutines(db, now, execute);
    await runDueJarvisRoutines(db, new Date("2026-10-28T17:00:00Z"), execute);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});