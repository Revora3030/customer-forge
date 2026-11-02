/**
 * Durable agent run store (PAI-2).
 *
 * A run is claimed with a lease and a fence number. Every later write presents
 * that fence, so a worker that was cut off can never overwrite the worker that
 * resumed the run. Progress lives in `checkpoint`; a retried run starts from the
 * last saved checkpoint instead of from scratch. Stalled runs are retried a
 * bounded number of times, then fail with a plain-English reason.
 *
 * `RunRepo` is the storage seam: `supabaseRunRepo` talks to the SQL functions in
 * 20261101020000_agent_runs.sql, tests use an in-memory copy of the same rules.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { STALLED_LEASE_GRACE_MS } from "@/lib/builder/job-liveness";

export type AgentRunStatus = "queued" | "processing" | "needs_approval" | "needs_input" | "done" | "failed" | "cancelled";
export type AgentRunSource = "owner" | "routine" | "admin" | "system";

export type AgentRun = {
  id: string;
  organization_id: string;
  user_id: string | null;
  goal: string;
  source: AgentRunSource;
  status: AgentRunStatus;
  attempts: number;
  max_attempts: number;
  fence: number;
  checkpoint: Record<string, unknown>;
  budget_cap: number | null;
  budget_used: number;
  result_summary: string | null;
  error_plain: string | null;
};

export type NewAgentRun = {
  organizationId: string;
  userId?: string | null;
  goal: string;
  source?: AgentRunSource;
  budgetCap?: number | null;
  maxAttempts?: number;
};

export type FinishStatus = "queued" | "needs_approval" | "needs_input" | "done" | "failed" | "cancelled";

export interface RunRepo {
  create(input: NewAgentRun): Promise<AgentRun>;
  claim(worker: string, leaseSeconds: number): Promise<AgentRun | null>;
  heartbeat(runId: string, fence: number, leaseSeconds: number): Promise<boolean>;
  save(runId: string, fence: number, checkpoint: Record<string, unknown>, budgetUsed?: number): Promise<boolean>;
  addEvent(runId: string, fence: number, kind: string, message: string, data?: Record<string, unknown>): Promise<boolean>;
  finish(runId: string, fence: number, status: FinishStatus, summary?: string | null, error?: string | null): Promise<boolean>;
  cancel(runId: string): Promise<boolean>;
  resume(runId: string): Promise<boolean>;
  recoverStalled(graceSeconds: number): Promise<{ run_id: string; outcome: "requeued" | "failed" }[]>;
}

/** Thrown inside an executor when a write shows another worker (or a cancel) now owns the run. */
export class LostLeaseError extends Error {
  constructor() {
    super("This worker no longer owns the run.");
    this.name = "LostLeaseError";
  }
}

export type RunContext = {
  run: AgentRun;
  /** Last saved checkpoint (empty on the first attempt). Resume from this. */
  checkpoint: Record<string, unknown>;
  /** Persist progress. Throws LostLeaseError when the run was taken over or cancelled. */
  save(checkpoint: Record<string, unknown>, budgetUsed?: number): Promise<void>;
  event(kind: string, message: string, data?: Record<string, unknown>): Promise<void>;
};

export type RunOutcome = {
  status: "done" | "needs_approval" | "needs_input" | "failed" | "cancelled";
  summary?: string;
  /** Plain-English reason for a failed run. */
  error?: string;
};

export type RunExecutor = (ctx: RunContext) => Promise<RunOutcome>;

const LEASE_SECONDS = 120;
const MAX_RUNS_PER_PASS = 3;
export const UNEXPECTED_ERROR_PLAIN = "The run hit an unexpected problem and was stopped before it finished. Nothing was sent.";

let registeredExecutor: RunExecutor | null = null;

/** The loop engine (PAI-3) registers itself here. Until then the kick only recovers stalled runs. */
export function registerAgentRunExecutor(executor: RunExecutor | null): void {
  registeredExecutor = executor;
}
export function getAgentRunExecutor(): RunExecutor | null {
  return registeredExecutor;
}

export type RunPassResult = {
  recovered: { requeued: number; failed: number };
  ran: { id: string; status: string }[];
  skipped?: "no executor";
};

export async function runDueAgentRuns(
  repo: RunRepo,
  executor: RunExecutor | null,
  opts: { worker?: string; maxRuns?: number; leaseSeconds?: number; graceMs?: number } = {},
): Promise<RunPassResult> {
  const leaseSeconds = opts.leaseSeconds ?? LEASE_SECONDS;
  const stalled = await repo.recoverStalled(Math.ceil((opts.graceMs ?? STALLED_LEASE_GRACE_MS) / 1000));
  const result: RunPassResult = {
    recovered: {
      requeued: stalled.filter((s) => s.outcome === "requeued").length,
      failed: stalled.filter((s) => s.outcome === "failed").length,
    },
    ran: [],
  };
  if (!executor) return { ...result, skipped: "no executor" };

  const worker = opts.worker ?? `worker-${Math.random().toString(36).slice(2, 10)}`;
  for (let i = 0; i < (opts.maxRuns ?? MAX_RUNS_PER_PASS); i++) {
    const run = await repo.claim(worker, leaseSeconds);
    if (!run) break;
    result.ran.push({ id: run.id, status: await executeClaimedRun(repo, run, executor, leaseSeconds) });
  }
  return result;
}

async function executeClaimedRun(repo: RunRepo, run: AgentRun, executor: RunExecutor, leaseSeconds: number): Promise<string> {
  const fence = run.fence;
  const ctx: RunContext = {
    run,
    checkpoint: run.checkpoint ?? {},
    async save(checkpoint, budgetUsed) {
      if (!(await repo.save(run.id, fence, checkpoint, budgetUsed))) throw new LostLeaseError();
    },
    async event(kind, message, data) {
      if (!(await repo.addEvent(run.id, fence, kind, message, data))) throw new LostLeaseError();
    },
  };
  // Keep the lease alive while the executor works, so only a dead worker's lease lapses.
  const beat = setInterval(() => {
    void repo.heartbeat(run.id, fence, leaseSeconds).catch(() => undefined);
  }, Math.max(5_000, (leaseSeconds * 1000) / 3));
  try {
    const outcome = await executor(ctx);
    const ok = await repo.finish(run.id, fence, outcome.status, outcome.summary ?? null, outcome.error ?? null);
    return ok ? outcome.status : "lost";
  } catch (error) {
    if (error instanceof LostLeaseError) return "lost";
    console.error("[agent-run]", run.id, error);
    // Retry from the checkpoint while attempts remain, otherwise fail in plain words.
    const retry = run.attempts < run.max_attempts;
    const ok = await repo.finish(run.id, fence, retry ? "queued" : "failed", null, UNEXPECTED_ERROR_PLAIN);
    return ok ? (retry ? "queued" : "failed") : "lost";
  } finally {
    clearInterval(beat);
  }
}

// ---- Supabase implementation -------------------------------------------------

type RpcResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;
type RpcClient = { rpc(fn: string, args?: Record<string, unknown>): RpcResult };

async function call(client: RpcClient, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

function firstRun(data: unknown): AgentRun | null {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object" ? (row as AgentRun) : null;
}

export function supabaseRunRepo(admin: SupabaseClient | unknown): RunRepo {
  const client = admin as RpcClient;
  return {
    async create(input) {
      const run = firstRun(
        await call(client, "agent_run_create", {
          _org: input.organizationId,
          _user: input.userId ?? null,
          _goal: input.goal,
          _source: input.source ?? "owner",
          _budget_cap: input.budgetCap ?? null,
          _max_attempts: input.maxAttempts ?? 3,
        }),
      );
      if (!run) throw new Error("agent_run_create returned no run");
      return run;
    },
    async claim(worker, leaseSeconds) {
      return firstRun(await call(client, "agent_run_claim", { _worker: worker, _lease_seconds: leaseSeconds }));
    },
    async heartbeat(runId, fence, leaseSeconds) {
      return (await call(client, "agent_run_heartbeat", { _run: runId, _fence: fence, _lease_seconds: leaseSeconds })) === true;
    },
    async save(runId, fence, checkpoint, budgetUsed) {
      return (await call(client, "agent_run_save", { _run: runId, _fence: fence, _checkpoint: checkpoint, _budget_used: budgetUsed ?? null })) === true;
    },
    async addEvent(runId, fence, kind, message, data) {
      return (await call(client, "agent_run_add_event", { _run: runId, _fence: fence, _kind: kind, _message: message, _data: data ?? {} })) === true;
    },
    async finish(runId, fence, status, summary, error) {
      return (await call(client, "agent_run_finish", { _run: runId, _fence: fence, _status: status, _summary: summary ?? null, _error: error ?? null })) === true;
    },
    async cancel(runId) {
      return (await call(client, "agent_run_cancel", { _run: runId })) === true;
    },
    async resume(runId) {
      return (await call(client, "agent_run_resume", { _run: runId })) === true;
    },
    async recoverStalled(graceSeconds) {
      const data = await call(client, "agent_run_recover_stalled", { _grace_seconds: graceSeconds });
      return Array.isArray(data) ? (data as { run_id: string; outcome: "requeued" | "failed" }[]) : [];
    },
  };
}

/** Queue a run. A worker kick (cron every minute) picks it up. */
export function createAgentRun(admin: SupabaseClient | unknown, input: NewAgentRun): Promise<AgentRun> {
  return supabaseRunRepo(admin).create(input);
}
