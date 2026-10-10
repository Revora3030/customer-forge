import { afterEach, describe, expect, it, vi } from "vitest";
import { RevoraAiError } from "@/lib/ai/errors";
import {
  claimJob,
  closeAbandonedJobs,
  drainSiteEngineQueue,
  LEASE_SECONDS,
  retryDelayMs,
  StaleAttemptError,
  touchLease,
} from "@/lib/site-engine.worker.server";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Executes the actual query predicates/updates, rather than matching source text. */
function database(jobs: Row[], options: { queueReadError?: boolean } = {}) {
  const tables: Record<string, Row[]> = {
    generation_jobs: jobs,
    job_queue_state: [{ id: "site_engine", paused: false, consecutive_rate_limits: 0 }],
  };
  const db = {
    from(table: string) {
      const rows = tables[table] ?? (tables[table] = []);
      const predicates: Array<(row: Row) => boolean> = [];
      let patch: Row | undefined;
      let upsert: Row | undefined;
      let limit = Infinity;
      let sortKey: string | undefined;
      const query = {
        select: () => query,
        update: (value: Row) => { patch = value; return query; },
        upsert: (value: Row) => { upsert = value; return query; },
        eq: (key: string, value: unknown) => { predicates.push(row => row[key] === value); return query; },
        neq: (key: string, value: unknown) => { predicates.push(row => row[key] !== value); return query; },
        in: (key: string, values: unknown[]) => { predicates.push(row => values.includes(row[key])); return query; },
        is: (key: string, value: unknown) => { predicates.push(row => row[key] === value); return query; },
        lt: (key: string, value: string | number) => { predicates.push(row => row[key] != null && row[key] < value); return query; },
        gte: (key: string, value: string | number) => { predicates.push(row => row[key] != null && row[key] >= value); return query; },
        or: (filter: string) => {
          const threshold = filter.split("lease_expires_at.lte.")[1]!;
          predicates.push(row => row["lease_expires_at"] == null || row["lease_expires_at"] <= threshold);
          return query;
        },
        order: (key: string) => { sortKey = key; return query; },
        limit: (value: number) => { limit = value; return query; },
        maybeSingle: async () => table === "job_queue_state" && options.queueReadError
          ? { data: null, error: { message: "database unavailable" } }
          : { ...execute(), data: executeOnceData?.[0] ?? null },
        then: (resolve: (result: { data: Row[]; error: null }) => unknown) => Promise.resolve(execute()).then(resolve),
      };
      let executeOnceData: Row[] | undefined;
      function execute(): { data: Row[]; error: null } {
        if (executeOnceData) return { data: executeOnceData, error: null };
        if (upsert) {
          const existing = rows.find(row => row["id"] === upsert!["id"]);
          if (existing) Object.assign(existing, upsert);
          else rows.push(upsert);
        }
        let selected = rows.filter(row => predicates.every(predicate => predicate(row)));
        if (sortKey) selected = [...selected].sort((a, b) => String(a[sortKey!]).localeCompare(String(b[sortKey!])));
        selected = selected.slice(0, limit);
        if (patch) selected.forEach(row => Object.assign(row, patch));
        executeOnceData = selected.map(row => ({ ...row }));
        return { data: executeOnceData, error: null };
      }
      return query;
    },
  };
  return { db: db as never, tables };
}

const queued = (id: string, organizationId = "tenant-a", overrides: Row = {}): Row => ({
  id,
  organization_id: organizationId,
  created_by: null,
  attempts: 0,
  status: "queued",
  current_step: "conversion",
  lease_expires_at: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  ...overrides,
});

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("worker queue behavior", () => {
  it("closes exhausted queued jobs only in the requested workspace", async () => {
    const a = queued("a", "tenant-a", { attempts: 3 });
    const b = queued("b", "tenant-b", { attempts: 3 });
    const c = queued("c", "tenant-a", { attempts: 2 });
    const { db } = database([a, b, c]);
    await closeAbandonedJobs(db, "tenant-a");
    expect(a["status"]).toBe("failed");
    expect(b["status"]).toBe("queued");
    expect(c["status"]).toBe("queued");
  });

  it("does not let five leased jobs hide a runnable job", async () => {
    const busy = Array.from({ length: 5 }, (_, i) => queued(`busy-${i}`, `busy-tenant-${i}`, {
      status: "processing", attempts: 1, lease_expires_at: "2099-01-01T00:00:00Z",
    }));
    const ready = queued("ready", "tenant-b", { created_at: "2026-10-02T00:00:00Z" });
    const { db } = database([...busy, ready]);
    expect((await claimJob(db))?.id).toBe("ready");
    expect(ready["attempts"]).toBe(1);
    expect(busy.every(row => row["attempts"] === 1)).toBe(true);
  });

  it.each([402, 403, 429, 503])("a %i failure does not pause another workspace", async (status) => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const first = queued("first");
    const second = queued("second", "tenant-b", { created_at: "2026-10-02T00:00:00Z" });
    const { db, tables } = database([first, second]);
    const execute = vi.fn(async (_db, job) => {
      if (job.id === "first") throw new RevoraAiError(status, "Tenant provider unavailable");
      second["status"] = "completed";
    });
    const result = await drainSiteEngineQueue(db, { max: 2 }, execute);
    expect(result).toMatchObject({ processed: 1, failed: 1, paused: false });
    expect(second["status"]).toBe("completed");
    expect(tables["job_queue_state"]?.[0]?.["paused"]).toBe(false);
    expect(first["status"]).toBe(status === 402 || status === 403 ? "failed" : "queued");
    if (first["status"] === "queued") expect(Date.parse(first["lease_expires_at"])).toBeGreaterThan(Date.now());
  });

  it("the last rate-limited attempt is terminal, not queued forever", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const row = queued("last", "tenant-a", { attempts: 2 });
    const { db } = database([row]);
    await drainSiteEngineQueue(db, { max: 1 }, async () => { throw new RevoraAiError(429, "Busy"); });
    expect(row["status"]).toBe("failed");
    expect(row["attempts"]).toBe(3);
    expect(row["completed_at"]).toBeTruthy();
  });

  it("never changes a cancelled or superseded attempt during failure settlement", async () => {
    for (const change of [{ status: "cancelled" }, { attempts: 2 }]) {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const row = queued("cancel");
      const { db } = database([row]);
      await drainSiteEngineQueue(db, { max: 1 }, async () => {
        Object.assign(row, change);
        throw new RevoraAiError(403, "Policy");
      });
      expect(row).toMatchObject(change);
      expect(row["error_message"]).toBeUndefined();
    }
  });

  it("renews for 300 seconds and refuses a stale/cancelled attempt", async () => {
    const row = queued("active", "tenant-a", { status: "processing", attempts: 1 });
    const { db } = database([row]);
    const now = Date.now();
    await touchLease(db, { id: "active", attempts: 1 });
    expect(LEASE_SECONDS).toBe(300);
    expect(Date.parse(row["lease_expires_at"])).toBeGreaterThanOrEqual(now + 300_000);
    await expect(touchLease(db, { id: "active", attempts: 2 })).rejects.toBeInstanceOf(StaleAttemptError);
    row["status"] = "cancelled";
    await expect(touchLease(db, { id: "active", attempts: 1 })).rejects.toBeInstanceOf(StaleAttemptError);
  });

  it("bounds retry delays without ignoring a tenant cooldown", () => {
    expect(retryDelayMs(1)).toBe(15_000);
    expect(retryDelayMs(2)).toBe(30_000);
    expect(retryDelayMs(1, 600)).toBe(600_000);
    expect(retryDelayMs(2, Infinity)).toBe(30_000);
    expect(retryDelayMs(999, 999999)).toBe(1_800_000);
  });

  it("respects retry-not-before times and does not claim a different tenant when scoped", async () => {
    const waiting = queued("waiting", "tenant-a", { lease_expires_at: "2099-01-01T00:00:00Z" });
    const ready = queued("ready", "tenant-b");
    const { db } = database([waiting, ready]);
    expect(await claimJob(db, "tenant-a")).toBeNull();
    expect((await claimJob(db))?.id).toBe("ready");
    expect(waiting["attempts"]).toBe(0);
  });

  it("honors an explicit operator pause without executing a job", async () => {
    const { db, tables } = database([queued("paused")]);
    Object.assign(tables["job_queue_state"]![0]!, { paused: true, pause_kind: "blocked", pause_reason: "maintenance" });
    const execute = vi.fn();
    expect(await drainSiteEngineQueue(db, { max: 1 }, execute)).toMatchObject({ paused: true, pauseReason: "maintenance" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not undo an operator pause requested during an in-flight build", async () => {
    const first = queued("first");
    const second = queued("second", "tenant-b", { created_at: "2026-10-02T00:00:00Z" });
    const { db, tables } = database([first, second]);
    const state = tables["job_queue_state"]![0]!;
    Object.assign(state, { paused: true, pause_kind: "credits", consecutive_rate_limits: 3 });
    const execute = vi.fn(async () => {
      first["status"] = "completed";
      Object.assign(state, { paused: true, pause_kind: "blocked", pause_reason: "operator maintenance" });
    });
    expect(await drainSiteEngineQueue(db, { max: 2 }, execute))
      .toMatchObject({ processed: 1, paused: true, pauseReason: "operator maintenance" });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(state["paused"]).toBe(true);
    expect(state["pause_kind"]).toBe("blocked");
    expect(second["status"]).toBe("queued");
  });

  it("fails closed when the operator pause state cannot be read", async () => {
    const row = queued("unverified");
    const { db } = database([row], { queueReadError: true });
    const execute = vi.fn();
    await expect(drainSiteEngineQueue(db, { max: 1 }, execute)).rejects.toThrow("queue state could not be checked");
    expect(execute).not.toHaveBeenCalled();
    expect(row["attempts"]).toBe(0);
  });
});
