import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jobStageCheckpointStore } from "@/lib/builder/job-stage-checkpoints";
import {
  BuildHandBackError,
  claimJob,
  createRunSlice,
  drainSiteEngineQueue,
  handBackDue,
  KICK_SLICE_BUDGET_MS,
  LEASE_SECONDS,
  MAX_HAND_BACKS,
  NEXT_STAGE_RESERVE_MS,
  PLATFORM_REQUEST_LIMIT_MS,
  RUN_BUDGET_MS,
  type ClaimedJob,
} from "@/lib/site-engine.worker.server";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** In-memory tables that execute the worker's real predicates and updates. */
function database(jobs: Row[]) {
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
      let done: Row[] | undefined;
      const execute = () => {
        if (done) return { data: done, error: null };
        if (upsert) {
          const existing = rows.find((row) => row["id"] === upsert!["id"]);
          if (existing) Object.assign(existing, upsert);
          else rows.push(upsert);
        }
        let selected = rows.filter((row) => predicates.every((predicate) => predicate(row)));
        if (sortKey) selected = [...selected].sort((a, b) => String(a[sortKey!]).localeCompare(String(b[sortKey!])));
        selected = selected.slice(0, limit);
        if (patch) selected.forEach((row) => Object.assign(row, patch));
        done = selected.map((row) => ({ ...row }));
        return { data: done, error: null };
      };
      const query = {
        select: () => query,
        update: (value: Row) => { patch = value; return query; },
        upsert: (value: Row) => { upsert = value; return query; },
        insert: (value: Row) => { rows.push({ ...value, created_at: new Date().toISOString() }); done = [{ ...value }]; return query; },
        eq: (key: string, value: unknown) => { predicates.push((row) => row[key] === value); return query; },
        neq: (key: string, value: unknown) => { predicates.push((row) => row[key] !== value); return query; },
        in: (key: string, values: unknown[]) => { predicates.push((row) => values.includes(row[key])); return query; },
        is: (key: string, value: unknown) => { predicates.push((row) => row[key] === value); return query; },
        not: () => { predicates.push(() => false); return query; },
        filter: () => { predicates.push(() => false); return query; },
        lt: (key: string, value: string | number) => { predicates.push((row) => row[key] != null && row[key] < value); return query; },
        lte: (key: string, value: string | number) => { predicates.push((row) => row[key] != null && row[key] <= value); return query; },
        gte: (key: string, value: string | number) => { predicates.push((row) => row[key] != null && row[key] >= value); return query; },
        or: (filter: string) => {
          const threshold = filter.split("lease_expires_at.lte.")[1]!;
          predicates.push((row) => row["lease_expires_at"] == null || row["lease_expires_at"] <= threshold);
          return query;
        },
        order: (key: string) => { sortKey = key; return query; },
        limit: (value: number) => { limit = value; return query; },
        maybeSingle: async () => ({ data: execute().data[0] ?? null, error: null }),
        then: (resolve: (result: { data: Row[]; error: null }) => unknown) => Promise.resolve(execute()).then(resolve),
      };
      return query;
    },
  };
  return { db: db as never, tables };
}

const newJob = (overrides: Row = {}): Row => ({
  id: "job-1",
  organization_id: "org-1",
  created_by: null,
  attempts: 0,
  status: "queued",
  current_step: null,
  lease_expires_at: null,
  stage_checkpoints: null,
  created_at: "2026-10-27T00:00:00.000Z",
  updated_at: "2026-10-27T00:00:00.000Z",
  ...overrides,
});

/**
 * A stand-in for runJob with the same lifetime rules: each AI stage resumes
 * from its stage checkpoint or is authored (taking `stageMs` of wall clock)
 * and saved, progress is written like step(), and the run's slice decides at
 * every boundary whether to hand back.
 */
function fakeBuild(stages: { key: string; ai: boolean }[], stageMs: number) {
  const authored: string[] = [];
  const execute = async (db: never, job: ClaimedJob, run: { deadline: number; short?: boolean } = { deadline: Infinity }) => {
    const store = jobStageCheckpointStore(db, { jobId: job.id, organizationId: job.organization_id, attempts: job.attempts });
    const slice = createRunSlice({ jobId: job.id, deadline: run.deadline, fresh: !job.current_step || run.short === true, store });
    for (const stage of stages) {
      if (stage.ai && !(await store.get(stage.key, { stage: stage.key }))) {
        vi.setSystemTime(Date.now() + stageMs);
        authored.push(stage.key);
        if (await store.put(stage.key, { stage: stage.key }, { authoredBy: "ai", stage: stage.key })) slice.progressed();
      }
      await (db as { from: (t: string) => any }).from("generation_jobs") // eslint-disable-line @typescript-eslint/no-explicit-any
        .update({ current_step: stage.key, updated_at: new Date().toISOString() })
        .eq("id", job.id).eq("attempts", job.attempts).eq("status", "processing");
      await slice.handBackIfDue(stage.key);
    }
    await (db as { from: (t: string) => any }).from("generation_jobs") // eslint-disable-line @typescript-eslint/no-explicit-any
      .update({ status: "completed", lease_expires_at: null })
      .eq("id", job.id).eq("attempts", job.attempts).eq("status", "processing");
  };
  return { execute, authored };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-27T12:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("build run budget", () => {
  it("budgets 80% of the 300 s platform ceiling the lease is sized to", () => {
    expect(PLATFORM_REQUEST_LIMIT_MS).toBe(LEASE_SECONDS * 1000);
    expect(RUN_BUDGET_MS).toBe(240_000);
    expect(handBackDue(1_000_000, 1_000_000 - NEXT_STAGE_RESERVE_MS - 1)).toBe(false);
    expect(handBackDue(1_000_000, 1_000_000 - NEXT_STAGE_RESERVE_MS)).toBe(true);
    expect(KICK_SLICE_BUDGET_MS).toBeLessThan(NEXT_STAGE_RESERVE_MS);
  });

  it("a run that reaches its budget hands the lease back and the next run resumes from the checkpoint", async () => {
    const { db, tables } = database([newJob()]);
    const continueBuild = vi.fn(async () => true);
    const build = fakeBuild(
      [
        { key: "brief", ai: true },
        { key: "identity", ai: true },
        { key: "refined", ai: true },
        { key: "wording", ai: true },
      ],
      100_000,
    );
    const job = tables["generation_jobs"]![0]!;

    // Run 1: brief (100 s) then identity (200 s) passes the budget -> hand back.
    const first = await drainSiteEngineQueue(db, { max: 1, continueBuild }, build.execute as never);
    expect(first).toMatchObject({ handedBack: 1, processed: 0, failed: 0 });
    expect(build.authored).toEqual(["brief", "identity"]);
    expect(job).toMatchObject({ status: "queued", attempts: 0, lease_expires_at: null, current_step: "identity" });
    expect(continueBuild).toHaveBeenCalledWith("org-1");
    const ended = (tables["ai_generations"] ?? []).filter((row) => row["kind"] === "build_attempt_ended");
    expect(ended).toHaveLength(1);
    expect(ended[0]!["result"]).toMatchObject({ outcome: "handed_back", point: "identity", attempt: 1 });

    // Run 2 resumes: brief and identity come from the checkpoint, not the AI.
    const second = await drainSiteEngineQueue(db, { max: 1, continueBuild }, build.execute as never);
    expect(second.handedBack).toBe(1);
    expect(build.authored).toEqual(["brief", "identity", "refined", "wording"]);

    // Run 3 finds every stage saved and completes without asking the AI again.
    const third = await drainSiteEngineQueue(db, { max: 1, continueBuild }, build.execute as never);
    expect(third).toMatchObject({ processed: 1, failed: 0 });
    expect(build.authored).toHaveLength(4);
    expect(job["status"]).toBe("completed");
    expect((tables["ai_generations"] ?? []).some((row) => row["kind"] === "build_attempt_lost")).toBe(false);
  });

  it("a handed-back lease does not consume an attempt, even on the last allowed attempt", async () => {
    // Two attempts were already lost before; every run now does one stage and hands back.
    const { db, tables } = database([newJob({ attempts: 2, current_step: "business" })]);
    const stages = ["a", "b", "c", "d", "e"].map((key) => ({ key, ai: true }));
    const build = fakeBuild(stages, 200_000);
    const job = tables["generation_jobs"]![0]!;
    let runs = 0;
    while (job["status"] !== "completed" && runs < 10) {
      await drainSiteEngineQueue(db, { max: 1, continueBuild: async () => true }, build.execute as never);
      runs += 1;
      expect(job["attempts"]).toBeLessThanOrEqual(3);
    }
    expect(job["status"]).toBe("completed");
    expect(runs).toBe(6);
    expect(job["attempts"]).toBe(3);
    expect(build.authored).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("a lapsed heartbeat still costs an attempt and is recorded as lost", async () => {
    const { db, tables } = database([newJob()]);
    const claimed = await claimJob(db);
    expect(claimed).toMatchObject({ attempts: 1, current_step: null });
    // The run dies: no hand-back, no heartbeat; the lease runs out.
    vi.setSystemTime(Date.now() + LEASE_SECONDS * 1000 + 1_000);
    const reclaimed = await claimJob(db);
    expect(reclaimed?.attempts).toBe(2);
    const lost = (tables["ai_generations"] ?? []).filter((row) => row["kind"] === "build_attempt_lost");
    expect(lost).toHaveLength(1);
    expect(lost[0]!["result"]).toMatchObject({ previousAttempt: 1 });
  });

  it("a resumed run that made no new progress does not hand back", async () => {
    const store = { get: vi.fn(async () => null), put: vi.fn(async () => true) };
    const slice = createRunSlice({ jobId: "job-1", deadline: Date.now() - 1, fresh: false, store });
    await expect(slice.handBackIfDue("analysis")).resolves.toBeUndefined();
    slice.progressed();
    await expect(slice.handBackIfDue("analysis")).rejects.toBeInstanceOf(BuildHandBackError);
    expect(store.put).toHaveBeenCalledWith("handback", expect.anything(), { count: 1, point: "analysis" });
  });

  it("stops handing back after the fuse, so a checkpoint that never matches cannot cycle", async () => {
    const store = { get: vi.fn(async () => ({ count: MAX_HAND_BACKS }) as never), put: vi.fn(async () => true) };
    const slice = createRunSlice({ jobId: "job-1", deadline: Date.now() - 1, fresh: true, store });
    await expect(slice.handBackIfDue("wording")).resolves.toBeUndefined();
    expect(store.put).not.toHaveBeenCalled();
  });

  it("a short kick slice hands back at the first resumable point before any AI stage", async () => {
    const { db, tables } = database([newJob()]);
    const build = fakeBuild([{ key: "business", ai: false }, { key: "brief", ai: true }], 100_000);
    const result = await drainSiteEngineQueue(
      db,
      { max: 1, organizationId: "org-1", invoker: "kick", sliceBudgetMs: KICK_SLICE_BUDGET_MS, continueBuild: async () => true },
      build.execute as never,
    );
    expect(result.handedBack).toBe(1);
    expect(build.authored).toEqual([]);
    expect(tables["generation_jobs"]![0]).toMatchObject({ status: "queued", attempts: 0, current_step: "business" });
  });
});
