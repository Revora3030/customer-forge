/**
 * PAI-5: limits, spend cap and kill switches for the platform AI.
 *
 * Four independent guards stand between a request and a model/tool call:
 *
 * 1. Global kill switch (env `AGENT_RUNS_DISABLED`): no new run starts anywhere
 *    and every queued run is cancelled. It needs no database to work.
 * 2. Workspace kill switch (`agent_settings.enabled = false`): the same, for one
 *    workspace only.
 * 3. Per-workspace limits kept in Postgres: runs in flight, runs per hour and
 *    tool calls per minute (`agent_limits` overrides, defaults below). The
 *    "can this run start" decision is one atomic SQL function, so ten requests
 *    arriving at once still cannot get an 11th run through.
 * 4. A per-run spend ceiling that sits on top of Luna's own ledger
 *    (`reserveBudget` / `settleBudget`): the run's own total is checked first,
 *    then the shared monthly and workspace caps still apply.
 *
 * Everything the counting needs lives behind the small `RunLedger`,
 * `LimitsStore` and `ToolCallCounter` interfaces. Today the ledger is the
 * `agent_run_admissions` table; once PAI-2's `agent_runs` is merged a second
 * implementation can count from there without changing any caller.
 *
 * Fail-closed: if the limits cannot be read or the ledger cannot be reached,
 * the run is refused with a plain message instead of being let through.
 *
 * Server-only. Nothing here sends to a customer, touches billing or Stripe, or
 * receives an organization id from the model.
 */

import type { ToolContext, ToolResult } from "@/lib/ai/tools.server";

/* --------------------------------- defaults -------------------------------- */

export type AgentLimits = {
  /** Runs that are queued or running at the same moment. */
  maxConcurrentRuns: number;
  /** Runs admitted in any rolling hour. */
  maxRunsPerHour: number;
  maxToolCallsPerMinute: number;
  /** Per-run spend ceiling in Luna microcents ($1 = 100,000,000). */
  runBudgetMicrocents: number;
};

const MICROCENTS_PER_DOLLAR = 100_000_000;

export const DEFAULT_AGENT_LIMITS: AgentLimits = {
  maxConcurrentRuns: 3,
  maxRunsPerHour: 10,
  maxToolCallsPerMinute: 30,
  runBudgetMicrocents: 1 * MICROCENTS_PER_DOLLAR,
};

type Env = Record<string, string | undefined>;

function positiveInt(raw: unknown): number | null {
  const n = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Operator defaults, tunable from the environment without a deploy of code. */
export function defaultLimits(env: Env = process.env): AgentLimits {
  const usd = Number(env["AGENT_RUN_BUDGET_USD"]);
  return {
    maxConcurrentRuns:
      positiveInt(env["AGENT_MAX_CONCURRENT_RUNS"]) ?? DEFAULT_AGENT_LIMITS.maxConcurrentRuns,
    maxRunsPerHour: positiveInt(env["AGENT_MAX_RUNS_PER_HOUR"]) ?? DEFAULT_AGENT_LIMITS.maxRunsPerHour,
    maxToolCallsPerMinute:
      positiveInt(env["AGENT_MAX_TOOL_CALLS_PER_MINUTE"]) ??
      DEFAULT_AGENT_LIMITS.maxToolCallsPerMinute,
    runBudgetMicrocents:
      Number.isFinite(usd) && usd > 0
        ? Math.round(usd * MICROCENTS_PER_DOLLAR)
        : DEFAULT_AGENT_LIMITS.runBudgetMicrocents,
  };
}

/* ------------------------------ plain messages ----------------------------- */

export type RefusalReason =
  | "global_kill_switch"
  | "workspace_disabled"
  | "too_many_running"
  | "hourly_limit"
  | "tool_rate_limit"
  | "run_budget"
  | "unavailable";

export function refusalMessage(reason: RefusalReason, limits: AgentLimits): string {
  switch (reason) {
    case "global_kill_switch":
      return "Revora AI is paused right now, so your request wasn't started. Please try again later.";
    case "workspace_disabled":
      return "Revora AI is turned off for your workspace, so your request wasn't started.";
    case "too_many_running":
      return `Revora AI is already working on ${limits.maxConcurrentRuns} things for your workspace. Wait for one to finish, then try again.`;
    case "hourly_limit":
      return `You've reached the limit of ${limits.maxRunsPerHour} Revora AI runs per hour for your workspace. Please try again in a little while.`;
    case "tool_rate_limit":
      return "Revora AI is working too fast for this workspace, so it paused for a moment. It will carry on shortly.";
    case "run_budget":
      return "Revora AI reached the spending limit for this run and stopped. Nothing further was done.";
    case "unavailable":
      return "Revora AI couldn't check its limits just now, so it didn't start. Please try again shortly.";
  }
}

/* -------------------------------- interfaces ------------------------------- */

export type AgentSettings = { enabled: boolean; reason: string | null };

export type LimitsStore = {
  /** Missing row = enabled. Throws when the database cannot be read. */
  getSettings(organizationId: string): Promise<AgentSettings>;
  /** Per-workspace overrides; a missing field means "use the default". */
  getOverrides(organizationId: string): Promise<Partial<AgentLimits>>;
  /** Workspaces whose kill switch is on (for the sweep). */
  listDisabledOrganizations(): Promise<string[]>;
};

export type AdmitResult = {
  admitted: boolean;
  reason: "ok" | "workspace_disabled" | "too_many_running" | "hourly_limit";
  inFlight: number;
  runsLastHour: number;
};

export type CancelledRun = { runId: string; organizationId: string };

export type RunLedger = {
  admit(
    organizationId: string,
    runId: string,
    limits: Pick<AgentLimits, "maxConcurrentRuns" | "maxRunsPerHour">,
  ): Promise<AdmitResult>;
  markStarted(runId: string): Promise<boolean>;
  markFinished(runId: string): Promise<boolean>;
  /** Cancel queued runs for one workspace, or for all when null. */
  cancelQueued(organizationId: string | null, reason: string): Promise<CancelledRun[]>;
};

export type ToolCallCounter = {
  /** Tool calls the workspace made since `sinceMs` (epoch ms). */
  countSince(organizationId: string, sinceMs: number): Promise<number>;
};

export type LimitsDeps = {
  store: LimitsStore;
  ledger: RunLedger;
  toolCalls: ToolCallCounter;
  env?: Env;
  now?: () => number;
  /**
   * Called with runs the kill switch cancelled, so the run store (PAI-2's
   * `agent_runs`) can cancel the matching rows. Optional until PAI-2 lands.
   */
  onCancelled?: (runs: CancelledRun[]) => Promise<void> | void;
};

/* ------------------------------- kill switches ----------------------------- */

/** True when the operator turned every new AI run off (env `AGENT_RUNS_DISABLED`). */
export function globalKillSwitchOn(env: Env = process.env): boolean {
  const raw = (env["AGENT_RUNS_DISABLED"] ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

async function cancelQueued(
  deps: LimitsDeps,
  organizationId: string | null,
  reason: string,
): Promise<CancelledRun[]> {
  const cancelled = await deps.ledger.cancelQueued(organizationId, reason);
  if (cancelled.length && deps.onCancelled) await deps.onCancelled(cancelled);
  return cancelled;
}

/**
 * Cancels queued runs when a kill switch is on. Safe to call from the worker
 * kick on every tick: with no switch on it does nothing. Never cancels a run
 * that already started (it is stopped at its next tool call instead) and never
 * touches a workspace whose switch is off.
 */
export async function sweepKillSwitches(
  deps: LimitsDeps,
): Promise<{ globalOn: boolean; cancelled: CancelledRun[] }> {
  if (globalKillSwitchOn(deps.env ?? process.env)) {
    return { globalOn: true, cancelled: await cancelQueued(deps, null, "global_kill_switch") };
  }
  const cancelled: CancelledRun[] = [];
  for (const organizationId of await deps.store.listDisabledOrganizations()) {
    cancelled.push(...(await cancelQueued(deps, organizationId, "workspace_disabled")));
  }
  return { globalOn: false, cancelled };
}

/** Cancels one workspace's queued runs right after its switch is turned off. */
export async function cancelQueuedForWorkspace(organizationId: string, deps: LimitsDeps) {
  return cancelQueued(deps, organizationId, "workspace_disabled");
}

/* ---------------------------- resolve + admit a run ------------------------- */

export async function resolveLimits(organizationId: string, deps: LimitsDeps): Promise<AgentLimits> {
  const base = defaultLimits(deps.env ?? process.env);
  const o = await deps.store.getOverrides(organizationId);
  return {
    maxConcurrentRuns: positiveInt(o.maxConcurrentRuns) ?? base.maxConcurrentRuns,
    maxRunsPerHour: positiveInt(o.maxRunsPerHour) ?? base.maxRunsPerHour,
    maxToolCallsPerMinute: positiveInt(o.maxToolCallsPerMinute) ?? base.maxToolCallsPerMinute,
    runBudgetMicrocents: positiveInt(o.runBudgetMicrocents) ?? base.runBudgetMicrocents,
  };
}

export type Admission =
  | { ok: true; limits: AgentLimits; inFlight: number; runsLastHour: number }
  | { ok: false; reason: RefusalReason; message: string; limits: AgentLimits };

/**
 * The one door a new run goes through. Order: global switch, workspace switch,
 * then the atomic in-flight / per-hour check. A refusal carries a plain message
 * safe to show to the owner.
 */
export async function admitRun(
  input: { organizationId: string; runId: string },
  deps: LimitsDeps,
): Promise<Admission> {
  const env = deps.env ?? process.env;
  const fallback = defaultLimits(env);
  const refuse = (reason: RefusalReason, limits: AgentLimits): Admission => ({
    ok: false,
    reason,
    message: refusalMessage(reason, limits),
    limits,
  });

  if (globalKillSwitchOn(env)) {
    try {
      await cancelQueued(deps, null, "global_kill_switch");
    } catch (error) {
      console.error("[agent-limits] cancel on global switch failed", (error as Error).message);
    }
    return refuse("global_kill_switch", fallback);
  }

  try {
    const settings = await deps.store.getSettings(input.organizationId);
    if (!settings.enabled) {
      try {
        await cancelQueued(deps, input.organizationId, "workspace_disabled");
      } catch (error) {
        console.error("[agent-limits] cancel on workspace switch failed", (error as Error).message);
      }
      return refuse("workspace_disabled", fallback);
    }
    const limits = await resolveLimits(input.organizationId, deps);
    const result = await deps.ledger.admit(input.organizationId, input.runId, limits);
    if (!result.admitted) {
      const reason: RefusalReason =
        result.reason === "workspace_disabled"
          ? "workspace_disabled"
          : result.reason === "too_many_running"
            ? "too_many_running"
            : "hourly_limit";
      return refuse(reason, limits);
    }
    return { ok: true, limits, inFlight: result.inFlight, runsLastHour: result.runsLastHour };
  } catch (error) {
    console.error("[agent-limits] could not check limits", (error as Error).message);
    return refuse("unavailable", fallback);
  }
}

export const markRunStarted = (runId: string, deps: Pick<LimitsDeps, "ledger">) =>
  deps.ledger.markStarted(runId);
export const markRunFinished = (runId: string, deps: Pick<LimitsDeps, "ledger">) =>
  deps.ledger.markFinished(runId);

/* ------------------------------ tool-call limits --------------------------- */

export type ToolGate =
  | { ok: true }
  | { ok: false; reason: RefusalReason; message: string };

/**
 * Checked before every tool call of a run: both kill switches stop a run that
 * is already going at its next tool call, and the per-minute rate applies.
 */
export async function checkToolCall(organizationId: string, deps: LimitsDeps): Promise<ToolGate> {
  const env = deps.env ?? process.env;
  const fallback = defaultLimits(env);
  if (globalKillSwitchOn(env)) {
    return { ok: false, reason: "global_kill_switch", message: refusalMessage("global_kill_switch", fallback) };
  }
  try {
    const settings = await deps.store.getSettings(organizationId);
    if (!settings.enabled) {
      return { ok: false, reason: "workspace_disabled", message: refusalMessage("workspace_disabled", fallback) };
    }
    const limits = await resolveLimits(organizationId, deps);
    const now = (deps.now ?? Date.now)();
    const used = await deps.toolCalls.countSince(organizationId, now - 60_000);
    if (used >= limits.maxToolCallsPerMinute) {
      return { ok: false, reason: "tool_rate_limit", message: refusalMessage("tool_rate_limit", limits) };
    }
    return { ok: true };
  } catch (error) {
    console.error("[agent-limits] could not check tool limits", (error as Error).message);
    return { ok: false, reason: "unavailable", message: refusalMessage("unavailable", fallback) };
  }
}

export type LimitedToolResult =
  | ToolResult
  | {
      ok: false;
      tool: string;
      error: string;
      reason: "rate_limited" | "disabled";
      limit: RefusalReason;
      durationMs: number;
    };

/**
 * Runs a tool call through the limits first. The loop (PAI-3) calls this
 * instead of `runTool` directly. `run` is injectable for tests; it defaults to
 * the registry's `runTool`.
 */
export async function runToolWithLimits(
  context: ToolContext,
  call: { name: string; arguments: unknown; requestId: string },
  deps: LimitsDeps,
  run?: (context: ToolContext, call: { name: string; arguments: unknown; requestId: string }) => Promise<ToolResult>,
): Promise<LimitedToolResult> {
  const gate = await checkToolCall(context.organizationId, deps);
  if (!gate.ok) {
    return {
      ok: false,
      tool: call.name,
      error: gate.message,
      reason: gate.reason === "tool_rate_limit" || gate.reason === "unavailable" ? "rate_limited" : "disabled",
      limit: gate.reason,
      durationMs: 0,
    };
  }
  const execute = run ?? (await import("@/lib/ai/tools.server")).runTool;
  return execute(context, call);
}

/* ------------------------------ per-run budget ----------------------------- */

type Reservation = Awaited<ReturnType<typeof import("@/lib/ai/luna.server").reserveBudget>>;

export type BudgetLedger = {
  reserve: (estimate: number, organizationId: string | null) => Promise<Reservation>;
  settle: (
    organizationId: string | null,
    estimate: number,
    actual: number,
    paid: NonNullable<Reservation>["paid"],
  ) => Promise<void>;
};

async function lunaLedger(): Promise<BudgetLedger> {
  const luna = await import("@/lib/ai/luna.server");
  return { reserve: luna.reserveBudget, settle: luna.settleBudget };
}

export type RunBudgetGrant =
  | { allowed: true; estimate: number; reservation: NonNullable<Reservation> }
  | { allowed: false; reason: "run_budget" | "ledger"; message: string };

/**
 * Per-run spend guard. Wraps Luna's `reserveBudget` / `settleBudget`: a model
 * call is only reserved while this run's own total (settled cost + calls still
 * in flight) stays under the run ceiling, and Luna's workspace and monthly caps
 * apply on top. If Luna cannot reserve (cap reached or ledger unreachable) the
 * call is refused, never let through. Reservation estimates are held for the
 * life of the call and replaced by the real cost on `settle`.
 */
export function createRunBudgetGuard(options: {
  organizationId: string;
  capMicrocents: number;
  ledger?: BudgetLedger;
}) {
  let settled = 0;
  let held = 0;
  const cap = Math.max(0, Math.floor(options.capMicrocents));
  let ledgerPromise: Promise<BudgetLedger> | null = options.ledger ? Promise.resolve(options.ledger) : null;
  const getLedger = () => (ledgerPromise ??= lunaLedger());
  const message = refusalMessage("run_budget", { ...DEFAULT_AGENT_LIMITS });

  return {
    async reserve(estimateMicrocents: number): Promise<RunBudgetGrant> {
      const estimate = Math.max(0, Math.ceil(estimateMicrocents));
      if (settled + held + estimate > cap) return { allowed: false, reason: "run_budget", message };
      const ledger = await getLedger();
      const reservation = await ledger.reserve(estimate, options.organizationId);
      if (!reservation || !reservation.allowed) return { allowed: false, reason: "ledger", message };
      held += estimate;
      return { allowed: true, estimate, reservation };
    },
    /** Replace the reservation with the real cost (or 0 when the call failed). */
    async settle(grant: Extract<RunBudgetGrant, { allowed: true }>, actualMicrocents: number) {
      const actual = Math.max(0, Math.ceil(actualMicrocents));
      held = Math.max(0, held - grant.estimate);
      settled += actual;
      const ledger = await getLedger();
      await ledger.settle(options.organizationId, grant.estimate, actual, grant.reservation.paid);
    },
    state: () => ({ settled, held, cap, remaining: Math.max(0, cap - settled - held) }),
  };
}

/* ----------------------------- Supabase implementation ---------------------- */

type QueryResult = { data: unknown; error: unknown; count?: number | null };
type QueryChain = PromiseLike<QueryResult> & {
  eq: (column: string, value: unknown) => QueryChain;
  gte: (column: string, value: unknown) => QueryChain;
};
type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
  from: (table: string) => {
    select: (columns: string, options?: Record<string, unknown>) => QueryChain;
  };
};

async function adminClient(): Promise<RpcClient> {
  const mod = await import("@/integrations/supabase/client.server");
  return mod.supabaseAdmin as unknown as RpcClient;
}

function fail(error: unknown): never {
  throw new Error(typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "database error");
}

export function supabaseLimitsDeps(client?: RpcClient, extra: Pick<LimitsDeps, "onCancelled" | "env" | "now"> = {}): LimitsDeps {
  const get = async () => client ?? (await adminClient());

  const store: LimitsStore = {
    async getSettings(organizationId) {
      const c = await get();
      const { data, error } = (await c
        .from("agent_settings")
        .select("enabled, disabled_reason")
        .eq("organization_id", organizationId)) as { data: { enabled: boolean; disabled_reason: string | null }[] | null; error: unknown };
      if (error) fail(error);
      const row = data?.[0];
      return { enabled: row ? row.enabled !== false : true, reason: row?.disabled_reason ?? null };
    },
    async getOverrides(organizationId) {
      const c = await get();
      const { data, error } = (await c
        .from("agent_limits")
        .select("max_concurrent_runs, max_runs_per_hour, max_tool_calls_per_minute, run_budget_microcents")
        .eq("organization_id", organizationId)) as {
        data: Record<string, number | null>[] | null;
        error: unknown;
      };
      if (error) fail(error);
      const row = data?.[0];
      if (!row) return {};
      const out: Partial<AgentLimits> = {};
      if (row["max_concurrent_runs"]) out.maxConcurrentRuns = Number(row["max_concurrent_runs"]);
      if (row["max_runs_per_hour"]) out.maxRunsPerHour = Number(row["max_runs_per_hour"]);
      if (row["max_tool_calls_per_minute"]) out.maxToolCallsPerMinute = Number(row["max_tool_calls_per_minute"]);
      if (row["run_budget_microcents"]) out.runBudgetMicrocents = Number(row["run_budget_microcents"]);
      return out;
    },
    async listDisabledOrganizations() {
      const c = await get();
      const { data, error } = (await c.from("agent_settings").select("organization_id").eq("enabled", false)) as {
        data: { organization_id: string }[] | null;
        error: unknown;
      };
      if (error) fail(error);
      return (data ?? []).map((row) => row.organization_id);
    },
  };

  const ledger: RunLedger = {
    async admit(organizationId, runId, limits) {
      const c = await get();
      const { data, error } = await c.rpc("agent_limits_admit_run", {
        _organization_id: organizationId,
        _run_id: runId,
        _max_concurrent: limits.maxConcurrentRuns,
        _max_per_hour: limits.maxRunsPerHour,
      });
      if (error) fail(error);
      const row = (Array.isArray(data) ? data[0] : data) as
        | { admitted: boolean; reason: AdmitResult["reason"]; in_flight: number; runs_last_hour: number }
        | undefined;
      if (!row) fail("no admission result");
      return {
        admitted: Boolean(row.admitted),
        reason: row.reason,
        inFlight: Number(row.in_flight) || 0,
        runsLastHour: Number(row.runs_last_hour) || 0,
      };
    },
    async markStarted(runId) {
      const c = await get();
      const { data, error } = await c.rpc("agent_limits_mark_started", { _run_id: runId });
      if (error) fail(error);
      return data === true;
    },
    async markFinished(runId) {
      const c = await get();
      const { data, error } = await c.rpc("agent_limits_mark_finished", { _run_id: runId });
      if (error) fail(error);
      return data === true;
    },
    async cancelQueued(organizationId, reason) {
      const c = await get();
      const { data, error } = await c.rpc("agent_limits_cancel_queued", {
        _organization_id: organizationId,
        _reason: reason,
      });
      if (error) fail(error);
      return ((data as { run_id: string; organization_id: string }[] | null) ?? []).map((row) => ({
        runId: row.run_id,
        organizationId: row.organization_id,
      }));
    },
  };

  const toolCalls: ToolCallCounter = {
    async countSince(organizationId, sinceMs) {
      const c = await get();
      // Counts rows `runTool` already writes to ai_tool_audit (including refused
      // calls, so a model hammering a forbidden tool is rate limited too).
      const { count, error } = await c
        .from("ai_tool_audit")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("created_at", new Date(sinceMs).toISOString());
      if (error) fail(error);
      return count ?? 0;
    },
  };

  return { store, ledger, toolCalls, ...extra };
}
