import { describe, expect, it, vi } from "vitest";
import {
  LostLeaseError,
  NO_EXECUTOR_ERROR,
  UNEXPECTED_ERROR_PLAIN,
  runDueAgentRuns,
  supabaseRunRepo,
  type AgentRun,
  type FinishStatus,
  type NewAgentRun,
  type RunRepo,
} from "./run-store.server";

/** In-memory copy of the rules in 20261101020000_agent_runs.sql. */
function memoryRepo() {
  const runs = new Map<string, AgentRun & { leaseLapsed: boolean; backoff?: boolean; ageSeconds?: number }>();
  const events: { run_id: string; kind: string }[] = [];
  let n = 0;
  const live = (id: string, fence: number) => {
    const r = runs.get(id);
    return r && r.fence === fence && r.status === "processing" ? r : null;
  };
  const repo: RunRepo = {
    async create(input: NewAgentRun) {
      const run = {
        id: `run-${++n}`, organization_id: input.organizationId, user_id: input.userId ?? null, goal: input.goal,
        source: input.source ?? "owner", status: "queued" as const, attempts: 0, max_attempts: input.maxAttempts ?? 3,
        fence: 0, checkpoint: {}, budget_cap: null, budget_used: 0, result_summary: null, error_plain: null, leaseLapsed: false,
      };
      runs.set(run.id, run);
      return run;
    },
    async claim() {
      const r = [...runs.values()].find((x) => x.status === "queued" && !x.backoff);
      if (!r) return null;
      r.status = "processing"; r.fence += 1; r.attempts += 1; r.leaseLapsed = false;
      events.push({ run_id: r.id, kind: "started" });
      return { ...r };
    },
    async heartbeat(id, fence) { return !!live(id, fence); },
    async save(id, fence, checkpoint, budgetUsed) {
      const r = live(id, fence);
      if (!r) return false;
      r.checkpoint = checkpoint;
      if (budgetUsed !== undefined) r.budget_used = budgetUsed;
      return true;
    },
    async addEvent(id, fence, kind) {
      if (!live(id, fence)) return false;
      events.push({ run_id: id, kind });
      return true;
    },
    async finish(id, fence, status: FinishStatus, summary, error) {
      const r = live(id, fence);
      if (!r) return false;
      r.status = status; r.backoff = status === "queued"; r.result_summary = summary ?? r.result_summary; r.error_plain = error ?? null;
      return true;
    },
    async cancel(id) {
      const r = runs.get(id);
      if (!r || ["done", "failed", "cancelled"].includes(r.status)) return false;
      r.status = "cancelled"; r.fence += 1;
      return true;
    },
    async resume(id) {
      const r = runs.get(id);
      if (!r || !["needs_approval", "needs_input"].includes(r.status)) return false;
      r.status = "queued";
      return true;
    },
    async recoverStalled() {
      const out: { run_id: string; outcome: "requeued" | "failed" }[] = [];
      for (const r of runs.values()) {
        if (r.status !== "processing" || !r.leaseLapsed) continue;
        r.fence += 1;
        if (r.attempts >= r.max_attempts) {
          r.status = "failed";
          r.error_plain = `This run was interrupted ${r.attempts} times and could not finish.`;
          out.push({ run_id: r.id, outcome: "failed" });
        } else {
          r.status = "queued";
          out.push({ run_id: r.id, outcome: "requeued" });
        }
      }
      return out;
    },
    async failStaleQueued(olderThanSeconds, limit, error) {
      const stale = [...runs.values()]
        .filter((r) => r.status === "queued" && (r.ageSeconds ?? 0) > olderThanSeconds)
        .sort((a, b) => (b.ageSeconds ?? 0) - (a.ageSeconds ?? 0))
        .slice(0, limit);
      for (const r of stale) {
        r.status = "failed";
        r.error_plain = error;
      }
      return stale.map((r) => r.id);
    },
  };
  return { repo, runs, events };
}

const goal = { organizationId: "org-1", goal: "Reply to new leads from this week" };

describe("runDueAgentRuns", () => {
  it("recovers stalled runs but claims nothing without an executor", async () => {
    const { repo, runs } = memoryRepo();
    await repo.create(goal);
    const result = await runDueAgentRuns(repo, null);
    expect(result.skipped).toBe("no executor");
    expect([...runs.values()][0]!.status).toBe("queued");
  });

  it("runs a queued run to done and records the summary", async () => {
    const { repo, runs } = memoryRepo();
    await repo.create(goal);
    const result = await runDueAgentRuns(repo, async () => ({ status: "done", summary: "Replied to 2 leads." }));
    expect(result.ran).toEqual([{ id: "run-1", status: "done" }]);
    expect(runs.get("run-1")).toMatchObject({ status: "done", result_summary: "Replied to 2 leads." });
  });

  it("pauses for approval instead of finishing", async () => {
    const { repo, runs } = memoryRepo();
    await repo.create(goal);
    await runDueAgentRuns(repo, async () => ({ status: "needs_approval", summary: "Draft ready." }));
    expect(runs.get("run-1")!.status).toBe("needs_approval");
    expect(await repo.resume("run-1")).toBe(true);
    expect(runs.get("run-1")!.status).toBe("queued");
  });

  it("resumes from the checkpoint after the worker is cut off", async () => {
    const { repo, runs } = memoryRepo();
    await repo.create(goal);
    // First worker saves step 1, then its lease lapses without finishing.
    await runDueAgentRuns(repo, async (ctx) => {
      await ctx.save({ step: 1, found: ["a", "b"] });
      runs.get(ctx.run.id)!.leaseLapsed = true;
      throw new LostLeaseError();
    });
    expect(runs.get("run-1")!.status).toBe("processing");
    const seen: unknown[] = [];
    const result = await runDueAgentRuns(repo, async (ctx) => {
      seen.push(ctx.checkpoint, ctx.run.attempts);
      return { status: "done" };
    });
    expect(result.recovered.requeued).toBe(1);
    expect(seen).toEqual([{ step: 1, found: ["a", "b"] }, 2]);
    expect(runs.get("run-1")!.status).toBe("done");
  });

  it("fails a repeatedly stalled run with a plain reason", async () => {
    const { repo, runs } = memoryRepo();
    await repo.create({ ...goal, maxAttempts: 2 });
    for (let i = 0; i < 2; i++) {
      await runDueAgentRuns(repo, async (ctx) => {
        runs.get(ctx.run.id)!.leaseLapsed = true;
        throw new LostLeaseError();
      });
    }
    const result = await runDueAgentRuns(repo, null);
    expect(result.recovered.failed).toBe(1);
    expect(runs.get("run-1")!.status).toBe("failed");
    expect(runs.get("run-1")!.error_plain).toMatch(/interrupted 2 times/);
  });

  it("rejects writes from a worker whose fence is stale", async () => {
    const { repo, runs } = memoryRepo();
    const run = await repo.create(goal);
    const first = (await repo.claim("a", 120))!;
    runs.get(run.id)!.leaseLapsed = true;
    await repo.recoverStalled(60);
    const second = (await repo.claim("b", 120))!;
    expect(second.fence).toBeGreaterThan(first.fence);
    expect(await repo.save(run.id, first.fence, { stale: true })).toBe(false);
    expect(await repo.finish(run.id, first.fence, "done")).toBe(false);
    expect(await repo.save(run.id, second.fence, { fresh: true })).toBe(true);
    expect(runs.get(run.id)!.checkpoint).toEqual({ fresh: true });
  });

  it("a cancelled run stops the worker at its next write", async () => {
    const { repo, runs } = memoryRepo();
    await repo.create(goal);
    const result = await runDueAgentRuns(repo, async (ctx) => {
      await repo.cancel(ctx.run.id);
      await ctx.save({ step: 2 });
      return { status: "done" };
    });
    expect(result.ran[0]!.status).toBe("lost");
    expect(runs.get("run-1")!.status).toBe("cancelled");
  });

  it("retries an executor crash, then fails with a plain message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { repo, runs } = memoryRepo();
    await repo.create({ ...goal, maxAttempts: 2 });
    const crash = async () => { throw new Error("socket hang up at 10.0.0.4:5432"); };
    const first = await runDueAgentRuns(repo, crash);
    expect(first.ran[0]!.status).toBe("queued");
    expect(await runDueAgentRuns(repo, crash)).toMatchObject({ ran: [] }); // waiting out the retry delay
    runs.get("run-1")!.backoff = false;
    const second = await runDueAgentRuns(repo, crash);
    expect(second.ran[0]!.status).toBe("failed");
    expect(runs.get("run-1")!.error_plain).toBe(UNEXPECTED_ERROR_PLAIN);
    expect(runs.get("run-1")!.error_plain).not.toMatch(/socket|10\.0/);
  });
});

describe("runDueAgentRuns with no executor registered", () => {
  it("fails queued runs older than 30 minutes and leaves fresh ones queued", async () => {
    const { repo, runs } = memoryRepo();
    const old = await repo.create(goal);
    const fresh = await repo.create(goal);
    const justUnder = await repo.create(goal);
    runs.get(old.id)!.ageSeconds = 31 * 60;
    runs.get(fresh.id)!.ageSeconds = 60;
    runs.get(justUnder.id)!.ageSeconds = 29 * 60;
    const result = await runDueAgentRuns(repo, null);
    expect(result).toMatchObject({ skipped: "no executor", expired: 1 });
    expect(runs.get(old.id)).toMatchObject({ status: "failed", error_plain: NO_EXECUTOR_ERROR });
    expect(runs.get(fresh.id)!.status).toBe("queued");
    expect(runs.get(justUnder.id)!.status).toBe("queued");
  });

  it("bounds each pass to the batch size", async () => {
    const { repo, runs } = memoryRepo();
    for (let i = 0; i < 5; i++) runs.get((await repo.create(goal)).id)!.ageSeconds = 3600 + i;
    expect((await runDueAgentRuns(repo, null, { expireBatch: 2 })).expired).toBe(2);
    expect([...runs.values()].filter((r) => r.status === "failed")).toHaveLength(2);
  });

  it("never expires anything while an executor is registered", async () => {
    const { repo, runs } = memoryRepo();
    const failStaleQueued = vi.spyOn(repo, "failStaleQueued");
    runs.get((await repo.create(goal)).id)!.ageSeconds = 3600;
    await runDueAgentRuns(repo, async () => ({ status: "done" }));
    expect(failStaleQueued).not.toHaveBeenCalled();
  });
});

describe("supabaseRunRepo", () => {
  it("fails stale queued runs with a batch limit and a status = 'queued' fence", async () => {
    const calls: { table: string; op: string; args: unknown[] }[] = [];
    const chain = (table: string, op: string, result: unknown) => {
      const self: Record<string, unknown> = {};
      for (const method of ["select", "eq", "lt", "order", "limit", "update", "in"])
        self[method] = (...args: unknown[]) => (calls.push({ table, op: method, args }), self);
      self["then"] = (resolve: (v: unknown) => unknown) => resolve({ data: result, error: null });
      return self;
    };
    // Both the select and the fenced update return the one stale run.
    const from = vi.fn((table: string) => chain(table, "from", [{ id: "r-old" }]));
    const repo = supabaseRunRepo({ rpc: vi.fn(), from });
    expect(await repo.failStaleQueued(1800, 50, NO_EXECUTOR_ERROR)).toEqual(["r-old"]);
    const ops = calls.map((c) => [c.op, ...c.args.slice(0, 2)]);
    expect(ops).toContainEqual(["eq", "status", "queued"]);
    expect(ops).toContainEqual(["limit", 50]);
    expect(ops).toContainEqual(["in", "id", ["r-old"]]);
    const update = calls.find((c) => c.op === "update")!;
    expect(update.args[0]).toMatchObject({ status: "failed", error_plain: NO_EXECUTOR_ERROR });
    // The update itself is fenced on status = 'queued' (after .in), so a just-claimed run is untouched.
    const afterUpdate = calls.slice(calls.indexOf(update));
    expect(afterUpdate.map((c) => [c.op, ...c.args.slice(0, 2)])).toContainEqual(["eq", "status", "queued"]);
  });

  it("does not update anything when no queued run is stale", async () => {
    const update = vi.fn();
    const from = vi.fn(() => {
      const self: Record<string, unknown> = { update };
      for (const method of ["select", "eq", "lt", "order", "limit"]) self[method] = () => self;
      self["then"] = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      return self;
    });
    const repo = supabaseRunRepo({ rpc: vi.fn(), from });
    expect(await repo.failStaleQueued(1800, 50, NO_EXECUTOR_ERROR)).toEqual([]);
    expect(update).not.toHaveBeenCalled();
  });

  it("calls the fenced SQL functions with the fence it was given", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const repo = supabaseRunRepo({ rpc });
    expect(await repo.save("r1", 3, { a: 1 }, 0.5)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("agent_run_save", { _run: "r1", _fence: 3, _checkpoint: { a: 1 }, _budget_used: 0.5 });
  });

  it("treats an empty claim as nothing to do and surfaces SQL errors", async () => {
    const empty = supabaseRunRepo({ rpc: async () => ({ data: [], error: null }) });
    expect(await empty.claim("w", 120)).toBeNull();
    const broken = supabaseRunRepo({ rpc: async () => ({ data: null, error: { message: "boom" } }) });
    await expect(broken.claim("w", 120)).rejects.toThrow("agent_run_claim: boom");
  });
});
