import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { heartbeatIntervalMs, startLeaseHeartbeat } from "@/lib/site-engine.worker.server";
import { queuePumpDelay } from "@/lib/site-engine.hooks";

type Result = { data: unknown[] | null; error: { message: string } | null };

/** Minimal fake for `db.from(...).update(...).eq(...).eq(...).eq(...).select(...)`. */
function fakeDb(results: Array<Result | Error>) {
  const calls: Record<string, unknown>[] = [];
  const db = {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        calls.push(patch);
        const chain = {
          eq: () => chain,
          select: async () => {
            const next = results.shift() ?? { data: [{ id: "job" }], error: null };
            if (next instanceof Error) throw next;
            return next;
          },
        };
        return chain;
      },
    }),
  };
  return { db: db as never, calls };
}

describe("lease heartbeat", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires before half the lease expires", () => {
    const interval = heartbeatIntervalMs(180);
    expect(interval).toBeLessThan(90_000);
    expect(interval).toBeLessThanOrEqual(45_000);
    // Even a short lease keeps a full beat of margin.
    expect(heartbeatIntervalMs(30)).toBeLessThan(15_000);
  });

  it("renews the lease on every beat", async () => {
    const { db, calls } = fakeDb([]);
    const beat = startLeaseHeartbeat(db, { id: "job", attempts: 1 }, 1_000);
    await vi.advanceTimersByTimeAsync(3_100);
    beat.stop();
    expect(calls.length).toBe(3);
    expect(typeof calls[0]?.["lease_expires_at"]).toBe("string");
    expect(beat.lost()).toBe(false);
  });

  it("logs and counts renewal errors without crashing the build", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { db } = fakeDb([{ data: null, error: { message: "db timeout" } }, new Error("network down")]);
    const beat = startLeaseHeartbeat(db, { id: "job", attempts: 2 }, 1_000);
    await vi.advanceTimersByTimeAsync(2_100);
    expect(beat.failures()).toBe(2);
    expect(warn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(beat.failures()).toBe(0);
    beat.stop();
    warn.mockRestore();
  });

  it("stops and reports a lost lease when the attempt fence no longer matches", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { db, calls } = fakeDb([{ data: [], error: null }]);
    const beat = startLeaseHeartbeat(db, { id: "job", attempts: 1 }, 1_000);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(beat.lost()).toBe(true);
    expect(calls.length).toBe(1);
    warn.mockRestore();
  });
});

describe("abandoned job recovery (source contract)", () => {
  const worker = readFileSync("src/lib/site-engine.worker.server.ts", "utf8");

  it("re-queues lease-less processing jobs with attempts left and fails the rest", () => {
    expect(worker).toMatch(/\.is\("lease_expires_at", null\)\s*\n\s*\.lt\("attempts", MAX_ATTEMPTS\)/);
    expect(worker).toMatch(/\.is\("lease_expires_at", null\)\s*\n\s*\.gte\("attempts", MAX_ATTEMPTS\)/);
    expect(worker).toMatch(/INTERRUPTED_BUILD_MESSAGE/);
  });

  it("tags a reclaimed expired-lease job with a recovery message", () => {
    expect(worker).toMatch(/recovering \? \{ error_message: RECOVERING_BUILD_MESSAGE \}/);
  });

  it("never lets a run that lost its lease requeue or fail the job", () => {
    expect(worker.indexOf("if (heartbeat.lost())")).toBeGreaterThan(worker.indexOf("error instanceof StaleAttemptError) continue"));
  });
});

describe("client recovery pump", () => {
  it("nudges the worker as soon as a processing lease lapses", () => {
    const now = Date.parse("2026-10-05T12:00:00Z");
    expect(
      queuePumpDelay({ status: "processing", lease_expires_at: new Date(now - 120_000).toISOString() }, now),
    ).toBe(250);
  });
});
