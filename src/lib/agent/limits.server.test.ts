import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  admitRun,
  cancelQueuedForWorkspace,
  checkToolCall,
  createRunBudgetGuard,
  DEFAULT_AGENT_LIMITS,
  defaultLimits,
  globalKillSwitchOn,
  runToolWithLimits,
  sweepKillSwitches,
  type AdmitResult,
  type AgentLimits,
  type BudgetLedger,
  type CancelledRun,
  type LimitsDeps,
  type RunLedger,
} from "./limits.server";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

/** In-memory mirror of the SQL admission function, so the rules are tested without a database. */
function memoryLedger(clock: { now: number }) {
  type Row = { org: string; run: string; status: "queued" | "running" | "finished" | "cancelled"; at: number; started: boolean };
  const rows: Row[] = [];
  const disabled = new Set<string>();
  const ledger: RunLedger = {
    async admit(org, run, limits): Promise<AdmitResult> {
      const mine = rows.filter((r) => r.org === org);
      const inFlight = mine.filter((r) => r.status === "queued" || r.status === "running").length;
      const hour = mine.filter((r) => r.at > clock.now - 3_600_000 && !(r.status === "cancelled" && !r.started)).length;
      if (rows.some((r) => r.run === run)) return { admitted: true, reason: "ok", inFlight, runsLastHour: hour };
      if (disabled.has(org)) return { admitted: false, reason: "workspace_disabled", inFlight, runsLastHour: hour };
      if (inFlight >= limits.maxConcurrentRuns) return { admitted: false, reason: "too_many_running", inFlight, runsLastHour: hour };
      if (hour >= limits.maxRunsPerHour) return { admitted: false, reason: "hourly_limit", inFlight, runsLastHour: hour };
      rows.push({ org, run, status: "queued", at: clock.now, started: false });
      return { admitted: true, reason: "ok", inFlight: inFlight + 1, runsLastHour: hour + 1 };
    },
    async markStarted(run) {
      const r = rows.find((x) => x.run === run && x.status === "queued");
      if (r) {
        r.status = "running";
        r.started = true;
      }
      return Boolean(r);
    },
    async markFinished(run) {
      const r = rows.find((x) => x.run === run && (x.status === "queued" || x.status === "running"));
      if (r) r.status = "finished";
      return Boolean(r);
    },
    async cancelQueued(org, _reason) {
      const out: CancelledRun[] = [];
      for (const r of rows) {
        if (r.status === "queued" && (org === null || r.org === org)) {
          r.status = "cancelled";
          out.push({ runId: r.run, organizationId: r.org });
        }
      }
      return out;
    },
  };
  return { ledger, rows, disabled };
}

function makeDeps(opts: { env?: Record<string, string>; overrides?: Partial<AgentLimits>; toolCalls?: number; enabled?: boolean } = {}) {
  const clock = { now: 1_800_000_000_000 };
  const mem = memoryLedger(clock);
  const enabled = new Map<string, boolean>([[ORG_A, opts.enabled ?? true]]);
  const cancelled: CancelledRun[][] = [];
  const deps: LimitsDeps = {
    store: {
      getSettings: async (org) => ({ enabled: enabled.get(org) ?? true, reason: null }),
      getOverrides: async () => opts.overrides ?? {},
      listDisabledOrganizations: async () => [...enabled].filter(([, on]) => !on).map(([org]) => org),
    },
    ledger: mem.ledger,
    toolCalls: { countSince: async () => opts.toolCalls ?? 0 },
    env: opts.env ?? {},
    now: () => clock.now,
    onCancelled: (runs) => void cancelled.push(runs),
  };
  return { deps, clock, mem, enabled, cancelled };
}

describe("run admission", () => {
  it("defaults to 10 runs per hour and refuses the 11th with a plain message", async () => {
    expect(DEFAULT_AGENT_LIMITS.maxRunsPerHour).toBe(10);
    const { deps } = makeDeps();
    for (let i = 0; i < 10; i += 1) {
      const runId = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      const admitted = await admitRun({ organizationId: ORG_A, runId }, deps);
      expect(admitted.ok).toBe(true);
      await deps.ledger.markStarted(runId);
      await deps.ledger.markFinished(runId);
    }
    const eleventh = await admitRun({ organizationId: ORG_A, runId: "00000000-0000-4000-8000-0000000000ff" }, deps);
    expect(eleventh.ok).toBe(false);
    if (eleventh.ok) return;
    expect(eleventh.reason).toBe("hourly_limit");
    expect(eleventh.message).toBe(
      "You've reached the limit of 10 Revora AI runs per hour for your workspace. Please try again in a little while.",
    );
    expect(eleventh.message).not.toMatch(/error|exception|sql|stack|429|500/i);
  });

  it("lets runs through again once the hour has passed", async () => {
    const { deps, clock } = makeDeps({ overrides: { maxRunsPerHour: 2, maxConcurrentRuns: 5 } });
    expect((await admitRun({ organizationId: ORG_A, runId: "r1" }, deps)).ok).toBe(true);
    expect((await admitRun({ organizationId: ORG_A, runId: "r2" }, deps)).ok).toBe(true);
    expect((await admitRun({ organizationId: ORG_A, runId: "r3" }, deps)).ok).toBe(false);
    clock.now += 3_600_001;
    expect((await admitRun({ organizationId: ORG_A, runId: "r3" }, deps)).ok).toBe(true);
  });

  it("refuses beyond the concurrent limit and frees a slot when a run finishes", async () => {
    const { deps } = makeDeps({ overrides: { maxConcurrentRuns: 2 } });
    expect((await admitRun({ organizationId: ORG_A, runId: "r1" }, deps)).ok).toBe(true);
    expect((await admitRun({ organizationId: ORG_A, runId: "r2" }, deps)).ok).toBe(true);
    const third = await admitRun({ organizationId: ORG_A, runId: "r3" }, deps);
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.reason).toBe("too_many_running");
    await deps.ledger.markFinished("r1");
    expect((await admitRun({ organizationId: ORG_A, runId: "r3" }, deps)).ok).toBe(true);
  });

  it("counts per workspace, so one workspace's runs never use up another's", async () => {
    const { deps } = makeDeps({ overrides: { maxConcurrentRuns: 1 } });
    expect((await admitRun({ organizationId: ORG_A, runId: "a1" }, deps)).ok).toBe(true);
    expect((await admitRun({ organizationId: ORG_A, runId: "a2" }, deps)).ok).toBe(false);
    expect((await admitRun({ organizationId: ORG_B, runId: "b1" }, deps)).ok).toBe(true);
  });

  it("is idempotent for a run id that was already admitted", async () => {
    const { deps, mem } = makeDeps({ overrides: { maxConcurrentRuns: 1 } });
    await admitRun({ organizationId: ORG_A, runId: "r1" }, deps);
    expect((await admitRun({ organizationId: ORG_A, runId: "r1" }, deps)).ok).toBe(true);
    expect(mem.rows).toHaveLength(1);
  });

  it("fails closed when the ledger cannot be reached", async () => {
    const { deps } = makeDeps();
    deps.ledger.admit = async () => {
      throw new Error("connection reset");
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await admitRun({ organizationId: ORG_A, runId: "r1" }, deps);
    spy.mockRestore();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unavailable");
      expect(result.message).not.toMatch(/connection reset/);
    }
  });

  it("reads per-workspace overrides and operator env defaults", () => {
    expect(defaultLimits({ AGENT_MAX_RUNS_PER_HOUR: "25", AGENT_RUN_BUDGET_USD: "2.5" })).toMatchObject({
      maxRunsPerHour: 25,
      runBudgetMicrocents: 250_000_000,
    });
    expect(defaultLimits({ AGENT_MAX_RUNS_PER_HOUR: "-4", AGENT_RUN_BUDGET_USD: "nope" })).toMatchObject({
      maxRunsPerHour: 10,
      runBudgetMicrocents: 100_000_000,
    });
  });
});

describe("workspace kill switch", () => {
  it("blocks new runs and cancels that workspace's queued runs", async () => {
    const { deps, enabled, cancelled, mem } = makeDeps({ overrides: { maxConcurrentRuns: 5 } });
    await admitRun({ organizationId: ORG_A, runId: "q1" }, deps);
    await admitRun({ organizationId: ORG_A, runId: "q2" }, deps);
    await admitRun({ organizationId: ORG_B, runId: "other" }, deps);
    await deps.ledger.markStarted("q2"); // already running: not cancelled here
    enabled.set(ORG_A, false);

    const refused = await admitRun({ organizationId: ORG_A, runId: "q3" }, deps);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.reason).toBe("workspace_disabled");
      expect(refused.message).toBe("Revora AI is turned off for your workspace, so your request wasn't started.");
    }
    expect(mem.rows.find((r) => r.run === "q1")?.status).toBe("cancelled");
    expect(mem.rows.find((r) => r.run === "q2")?.status).toBe("running");
    expect(mem.rows.find((r) => r.run === "other")?.status).toBe("queued");
    expect(cancelled.flat()).toEqual([{ runId: "q1", organizationId: ORG_A }]);
    expect(mem.rows.some((r) => r.run === "q3")).toBe(false);
  });

  it("stops a run that is already going at its next tool call", async () => {
    const { deps, enabled } = makeDeps();
    enabled.set(ORG_A, false);
    const gate = await checkToolCall(ORG_A, deps);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("workspace_disabled");
  });

  it("sweep and cancelQueuedForWorkspace cancel queued runs only for disabled workspaces", async () => {
    const { deps, enabled, mem } = makeDeps({ overrides: { maxConcurrentRuns: 5 } });
    await admitRun({ organizationId: ORG_A, runId: "a1" }, deps);
    await admitRun({ organizationId: ORG_B, runId: "b1" }, deps);
    enabled.set(ORG_A, false);
    const swept = await sweepKillSwitches(deps);
    expect(swept).toMatchObject({ globalOn: false, cancelled: [{ runId: "a1", organizationId: ORG_A }] });
    expect(mem.rows.find((r) => r.run === "b1")?.status).toBe("queued");
    expect(await cancelQueuedForWorkspace(ORG_B, deps)).toEqual([{ runId: "b1", organizationId: ORG_B }]);
  });
});

describe("global env kill switch", () => {
  it("recognises the on values only", () => {
    for (const on of ["1", "true", "TRUE", " on ", "yes"]) expect(globalKillSwitchOn({ AGENT_RUNS_DISABLED: on })).toBe(true);
    for (const off of ["", "0", "false", "off", undefined]) expect(globalKillSwitchOn({ AGENT_RUNS_DISABLED: off })).toBe(false);
  });

  it("refuses new runs everywhere, even with a healthy ledger, and cancels queued runs", async () => {
    const env: Record<string, string> = {};
    const { deps, mem, cancelled } = makeDeps({ env, overrides: { maxConcurrentRuns: 5 } });
    await admitRun({ organizationId: ORG_A, runId: "a1" }, deps);
    await admitRun({ organizationId: ORG_B, runId: "b1" }, deps);
    env["AGENT_RUNS_DISABLED"] = "1";

    const refused = await admitRun({ organizationId: ORG_B, runId: "b2" }, deps);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.reason).toBe("global_kill_switch");
      expect(refused.message).toMatch(/paused right now/);
    }
    expect(mem.rows.filter((r) => r.status === "cancelled").map((r) => r.run).sort()).toEqual(["a1", "b1"]);
    expect(mem.rows.some((r) => r.run === "b2")).toBe(false);
    expect(cancelled.flat()).toHaveLength(2);
  });

  it("works without any database: store and ledger are never touched", async () => {
    const boom = () => {
      throw new Error("database must not be used");
    };
    const deps: LimitsDeps = {
      store: { getSettings: boom, getOverrides: boom, listDisabledOrganizations: boom },
      ledger: { admit: boom, markStarted: boom, markFinished: boom, cancelQueued: async () => [] },
      toolCalls: { countSince: boom },
      env: { AGENT_RUNS_DISABLED: "true" },
    };
    const result = await admitRun({ organizationId: ORG_A, runId: "r1" }, deps);
    expect(result).toMatchObject({ ok: false, reason: "global_kill_switch" });
    expect(await checkToolCall(ORG_A, deps)).toMatchObject({ ok: false, reason: "global_kill_switch" });
    expect(await sweepKillSwitches(deps)).toMatchObject({ globalOn: true });
  });

  it("sweep does nothing when no switch is on", async () => {
    const { deps, mem } = makeDeps();
    await admitRun({ organizationId: ORG_A, runId: "a1" }, deps);
    expect(await sweepKillSwitches(deps)).toEqual({ globalOn: false, cancelled: [] });
    expect(mem.rows[0]?.status).toBe("queued");
  });
});

describe("tool calls per minute", () => {
  it("allows calls under the limit and refuses at the limit", async () => {
    expect(await checkToolCall(ORG_A, makeDeps({ toolCalls: 29 }).deps)).toEqual({ ok: true });
    const gate = await checkToolCall(ORG_A, makeDeps({ toolCalls: 30 }).deps);
    expect(gate).toMatchObject({ ok: false, reason: "tool_rate_limit" });
  });

  it("runToolWithLimits never runs the tool when refused, and runs it otherwise", async () => {
    const run = vi.fn(async () => ({ ok: true as const, tool: "inspect_website", data: {}, durationMs: 1 }));
    const context = { supabase: {} as never, userId: "u", organizationId: ORG_A, isSuperAdmin: false };
    const call = { name: "inspect_website", arguments: {}, requestId: "r" };
    const blocked = await runToolWithLimits(context, call, makeDeps({ toolCalls: 99 }).deps, run);
    expect(blocked).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(run).not.toHaveBeenCalled();
    const allowed = await runToolWithLimits(context, call, makeDeps().deps, run);
    expect(allowed.ok).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("per-run budget (Luna reserveBudget)", () => {
  function lunaFake(allow = true) {
    const reserve = vi.fn(async (_estimate: number, _org: string | null) =>
      allow
        ? { allowed: true, spent: 0, cap: 1, calls: 0, tenantSpent: 0, tenantCap: 1, dailyCapped: false, paid: null }
        : null,
    );
    const settle = vi.fn(async () => undefined);
    return { reserve, settle, ledger: { reserve, settle } as unknown as BudgetLedger };
  }

  it("reserves through Luna for the workspace and settles the real cost", async () => {
    const luna = lunaFake();
    const guard = createRunBudgetGuard({ organizationId: ORG_A, capMicrocents: 1000, ledger: luna.ledger });
    const grant = await guard.reserve(400);
    expect(grant.allowed).toBe(true);
    if (!grant.allowed) return;
    expect(luna.reserve).toHaveBeenCalledWith(400, ORG_A);
    await guard.settle(grant, 150);
    expect(luna.settle).toHaveBeenCalledWith(ORG_A, 400, 150, null);
    expect(guard.state()).toMatchObject({ settled: 150, held: 0, remaining: 850 });
  });

  it("refuses a call that would pass the run ceiling without asking Luna", async () => {
    const luna = lunaFake();
    const guard = createRunBudgetGuard({ organizationId: ORG_A, capMicrocents: 1000, ledger: luna.ledger });
    const first = await guard.reserve(700);
    expect(first.allowed).toBe(true);
    const second = await guard.reserve(400);
    expect(second).toMatchObject({ allowed: false, reason: "run_budget" });
    expect(luna.reserve).toHaveBeenCalledTimes(1);
  });

  it("fails closed when Luna cannot reserve", async () => {
    const guard = createRunBudgetGuard({ organizationId: ORG_A, capMicrocents: 1000, ledger: lunaFake(false).ledger });
    expect(await guard.reserve(1)).toMatchObject({ allowed: false, reason: "ledger" });
  });
});

describe("migration", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261101060300_agent_limits.sql"), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  it("enables RLS on every new table and gives members read-only access", () => {
    for (const table of ["agent_settings", "agent_limits", "agent_run_admissions"]) {
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
      expect(sql).toMatch(new RegExp(`CREATE POLICY[^;]*ON public\\.${table}\\s+FOR SELECT`, "i"));
    }
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)\s+TO authenticated/i);
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*TO authenticated/i);
  });

  it("does not create agent_runs, touch billing or loosen the admission functions", () => {
    expect(sql).not.toMatch(/CREATE TABLE[^;]*agent_runs\b/i);
    expect(sql).not.toMatch(/stripe|subscription|price|billing/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.agent_limits_admit_run[^;]*FROM PUBLIC, anon, authenticated/);
  });
});
