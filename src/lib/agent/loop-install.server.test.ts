import { afterEach, describe, expect, it, vi } from "vitest";
import {
  agentLoopEnabled,
  AGENT_LOOP_FLAG,
  createLoopBuilder,
  ensureAgentLoopInstalled,
  resetAgentLoopInstall,
  sweepAgentKillSwitches,
  workspaceReadClient,
  type LoopInstallDeps,
} from "@/lib/agent/loop-install.server";
import {
  getAgentRunExecutor,
  registerAgentRunExecutor,
  type AgentRun,
  type RunContext,
} from "@/lib/agent/run-store.server";
import type { ApprovalRepo, ApprovalRow } from "@/lib/agent/approvals.server";
import type { AdmitResult, LimitsDeps } from "@/lib/agent/limits.server";
import type { ModelCall, ModelPricing } from "@/lib/agent/agent-model.server";
import { fakeDb } from "@/lib/test-support/fake-memory-db";

const ORG = "11111111-1111-4111-8111-111111111111";
const OWNER = "33333333-3333-4333-8333-333333333333";
const APPT = "66666666-6666-4666-8666-666666666666";

const run = (over: Partial<AgentRun> = {}): AgentRun => ({
  id: "run-1",
  organization_id: ORG,
  user_id: OWNER,
  goal: "Ask Dana for a review. Our weekday hours are 9 to 5.",
  source: "owner",
  status: "processing",
  attempts: 1,
  max_attempts: 3,
  fence: 1,
  checkpoint: {},
  budget_cap: null,
  budget_used: 0,
  result_summary: null,
  error_plain: null,
  ...over,
});

afterEach(() => {
  registerAgentRunExecutor(null);
  resetAgentLoopInstall();
  vi.restoreAllMocks();
});

/** Approvals in memory: just enough of the PAI-4 rules for a request to be filed and found again. */
function approvalRepo() {
  const rows: ApprovalRow[] = [];
  const repo: ApprovalRepo = {
    async request(i) {
      const found = rows.find(
        (r) => r.tool === i.tool && r.args_hash === i.argsHash && r.status === "pending",
      );
      if (found) return { approval: found, created: false };
      const row = {
        id: `00000000-0000-4000-8000-${String(rows.length + 1).padStart(12, "0")}`,
        organization_id: i.organizationId,
        scope: i.scope,
        run_id: i.runId,
        step_id: i.stepId,
        requested_by: i.requestedBy,
        tool: i.tool,
        args: i.args,
        args_hash: i.argsHash,
        summary: i.summary,
        status: "pending",
        created_at: "",
        expires_at: "",
        decided_by: null,
        decided_at: null,
        consumed_at: null,
      } as ApprovalRow;
      rows.push(row);
      return { approval: row, created: true };
    },
    async decide() {
      return { outcome: "not_found", approval: null };
    },
    async consume() {
      return { outcome: "not_found", approval: null };
    },
    async cancelForRun() {
      return 0;
    },
    async sweep() {
      return 0;
    },
  };
  return { repo, rows };
}

/** The PAI-5 gate: switches and ledger in memory. `killed` can be flipped while a run is going. */
function gate(env: Record<string, string> = {}) {
  const state = { killed: false };
  const log: string[] = [];
  const countSince = vi.fn(async () => 0);
  const limits = {
    env,
    store: {
      getSettings: vi.fn(async () => ({ enabled: !state.killed, reason: null })),
      getOverrides: async () => ({}),
      listDisabledOrganizations: vi.fn(async () => []),
    },
    ledger: {
      admit: vi.fn(async () => {
        log.push("admit");
        return { admitted: true, reason: "ok", inFlight: 1, runsLastHour: 1 } as AdmitResult;
      }),
      markStarted: vi.fn(async () => {
        log.push("started");
        return true;
      }),
      markFinished: vi.fn(async () => {
        log.push("finished");
        return true;
      }),
      cancelQueued: vi.fn(async () => []),
    },
    toolCalls: { countSince },
  } as unknown as LimitsDeps;
  return { limits, state, log, countSince };
}

/** A query builder that records every filter and answers with no rows. Reading it counts as the tool running. */
function recordingAdmin(onRead?: () => void) {
  const filters: [string, unknown][] = [];
  const writes: string[] = [];
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "then")
          return (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
        if (prop === "eq")
          return (c: string, v: unknown) => {
            filters.push([c, v]);
            return chain;
          };
        return () => chain;
      },
    },
  );
  const admin = {
    from: (table: string) => {
      onRead?.();
      const base = {
        select: () => chain,
        insert: () => {
          writes.push(`insert ${table}`);
          return chain;
        },
        update: () => {
          writes.push(`update ${table}`);
          return chain;
        },
        delete: () => {
          writes.push(`delete ${table}`);
          return chain;
        },
        upsert: () => {
          writes.push(`upsert ${table}`);
          return chain;
        },
      };
      return base;
    },
  };
  return { admin, filters, writes };
}

const pricing: ModelPricing = { estimate: () => 10, cost: () => 20, failureCharge: () => 0 };
const noLedger = {
  reserve: vi.fn(async () => ({ allowed: true })),
  settle: vi.fn(async () => undefined),
};

/** Scripted model: loop turns in order; the end-of-run memory review gets `review`. */
function scriptedModel(loop: unknown[], review: unknown = { memories: [] }) {
  const seen: string[] = [];
  let i = 0;
  const call = vi.fn<ModelCall>(async (turn) => {
    const system = turn.messages[0]!.content;
    seen.push(system);
    const data = system.includes("You review one finished assistant run")
      ? review
      : loop[Math.min(i++, loop.length - 1)];
    return { data, usage: { inputTokens: 100, outputTokens: 50 } };
  });
  return { call, seen };
}

function setup(over: {
  loop: unknown[];
  review?: unknown;
  env?: Record<string, string>;
  seed?: Parameters<typeof fakeDb>[0];
  limitsEnv?: Record<string, string>;
}) {
  const g = gate(over.limitsEnv);
  const { repo, rows } = approvalRepo();
  const mem = fakeDb(over.seed);
  const model = scriptedModel(over.loop, over.review);
  const rec = recordingAdmin(() => {});
  const audit: { tool: string; result_status: string }[] = [];
  const installDeps: LoopInstallDeps = {
    env: { [AGENT_LOOP_FLAG]: "1", ...over.env },
    limits: g.limits,
    approvals: { repo },
    client: (org) => workspaceReadClient(rec.admin, org),
    model: { call: model.call, pricing, ledger: noLedger as never },
    memory: { db: mem.db },
    audit: async (e) => {
      audit.push({ tool: e.tool, result_status: e.result_status });
    },
  };
  const ctxFor = (r: AgentRun) => {
    const events: string[] = [];
    const ctx: RunContext = {
      run: r,
      checkpoint: r.checkpoint,
      save: async () => {},
      event: async (kind) => {
        events.push(kind);
      },
    };
    return { ctx, events };
  };
  return { g, rows, mem, model, rec, audit, installDeps, ctxFor };
}

describe("the AGENT_LOOP_ENABLED flag", () => {
  it("is off unless explicitly turned on", () => {
    expect(agentLoopEnabled({})).toBe(false);
    for (const v of ["", "0", "false", "off", "no", "maybe", "2"])
      expect(agentLoopEnabled({ [AGENT_LOOP_FLAG]: v })).toBe(false);
    for (const v of ["1", "true", "TRUE", " on ", "yes"])
      expect(agentLoopEnabled({ [AGENT_LOOP_FLAG]: v })).toBe(true);
  });
});

describe("flag off (the default): nothing runs", () => {
  it("registers no executor, never builds the loop, never touches the limits store", async () => {
    const s = setup({
      loop: [{ final: { status: "done", summary: "x" } }],
      env: { [AGENT_LOOP_FLAG]: "" },
    });
    const install = vi.fn();
    expect(await ensureAgentLoopInstalled({ ...s.installDeps, install })).toBe(false);
    expect(install).not.toHaveBeenCalled();
    expect(getAgentRunExecutor()).toBeNull();
    expect(
      await sweepAgentKillSwitches({ env: s.installDeps.env!, limits: s.g.limits }),
    ).toBeNull();
    expect(s.g.limits.store.getSettings).not.toHaveBeenCalled();
    expect(s.g.limits.store.listDisabledOrganizations).not.toHaveBeenCalled();
    expect(s.model.call).not.toHaveBeenCalled();
  });

  it("with the flag missing entirely, the real process env is treated as off", async () => {
    const before = process.env[AGENT_LOOP_FLAG];
    delete process.env[AGENT_LOOP_FLAG];
    try {
      expect(await ensureAgentLoopInstalled({ install: vi.fn() })).toBe(false);
      expect(getAgentRunExecutor()).toBeNull();
    } finally {
      if (before !== undefined) process.env[AGENT_LOOP_FLAG] = before;
    }
  });
});

describe("flag on: the one install", () => {
  it("registers one executor and is safe to call on every tick", async () => {
    const s = setup({ loop: [{ final: { status: "done", summary: "x" } }] });
    const install = vi.fn();
    expect(await ensureAgentLoopInstalled({ ...s.installDeps, install })).toBe(true);
    expect(await ensureAgentLoopInstalled({ ...s.installDeps, install })).toBe(true);
    expect(install).toHaveBeenCalledTimes(1);
  });

  it("a read run: memory is recalled and proposed, tool calls are counted once, the slot is admitted and released once", async () => {
    const s = setup({
      loop: [
        { tool: "leads.list", args: {}, why: "look at leads" },
        { final: { status: "done", summary: "No leads yet." } },
      ],
      review: {
        memories: [
          { kind: "fact", key: "Parking", value: "Free behind the shop", source: "inferred" },
        ],
      },
      seed: {
        business_memory: [
          {
            id: "n1",
            organization_id: ORG,
            kind: "fact",
            key: "Weekday hours",
            value: "Open 9 to 5",
            status: "confirmed",
            source_type: "owner_entered",
            source_id: null,
            deleted_at: null,
            superseded_by: null,
            created_at: "2026-11-05T00:00:00Z",
          },
        ],
      },
    });
    expect(await ensureAgentLoopInstalled(s.installDeps)).toBe(true);
    const executor = getAgentRunExecutor()!;
    const { ctx, events } = s.ctxFor(run());
    const out = await executor(ctx);
    expect(out).toMatchObject({ status: "done" });
    // memory step ran: recalled into the prompt, proposed afterwards
    expect(s.model.seen.some((x) => x.includes("Weekday hours: Open 9 to 5"))).toBe(true);
    expect(events).toContain("memory_recalled");
    expect(events).toContain("memory_proposed");
    expect(
      s.mem.tables.business_memory.some(
        (n) => n["key"] === "Parking" && n["status"] === "proposed",
      ),
    ).toBe(true);
    // limits: one tool call, one count; one admit, one release
    expect(s.audit.filter((a) => a.tool === "leads.list")).toEqual([
      { tool: "leads.list", result_status: "ok" },
    ]);
    expect(s.g.countSince).toHaveBeenCalledTimes(1);
    expect(s.g.log).toEqual(["admit", "started", "finished"]);
    expect(s.g.limits.ledger.admit).toHaveBeenCalledTimes(1);
    // the tool read only this workspace
    expect(s.rec.filters[0]).toEqual(["organization_id", ORG]);
    expect(s.rec.writes).toEqual([]);
  });

  it("a risky send pauses for approval: nothing is sent, one request is filed, no tool call is counted", async () => {
    const s = setup({
      loop: [
        {
          tool: "reviews.request",
          args: { appointmentId: APPT, channel: "email" },
          why: "ask Dana for a review",
        },
      ],
    });
    await ensureAgentLoopInstalled(s.installDeps);
    const { ctx } = s.ctxFor(run());
    const out = await getAgentRunExecutor()!(ctx);
    expect(out.status).toBe("needs_approval");
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]).toMatchObject({
      tool: "reviews.request",
      status: "pending",
      organization_id: ORG,
      requested_by: OWNER,
    });
    expect(s.audit).toContainEqual({ tool: "reviews.request", result_status: "needs_approval" });
    expect(s.g.countSince).not.toHaveBeenCalled();
    expect(s.rec.writes).toEqual([]);
    expect(s.g.log.at(-1)).toBe("finished");
    // a run that did not finish proposes no memories
    expect(s.mem.tables.business_memory).toHaveLength(0);
  });

  it("a run with no owner cannot use workspace tools", async () => {
    const s = setup({
      loop: [
        { tool: "leads.list", args: {}, why: "look" },
        { final: { status: "done", summary: "x" } },
      ],
    });
    const build = createLoopBuilder(s.installDeps);
    const deps = await build(run({ user_id: null }));
    const result = await deps.tools.run({
      name: "leads.list",
      args: {},
      requestId: "r1",
      stepId: "s1",
    });
    expect(result).toMatchObject({ ok: false, reason: "forbidden" });
    expect(s.rec.filters).toEqual([]);
  });

  it("routine and no_external_actions runs omit PAI-11 write tools", async () => {
    const s = setup({ loop: [{ final: { status: "done", summary: "x" } }] });
    const build = createLoopBuilder(s.installDeps);

    const owner = await build(run({ source: "owner" }));
    expect(owner.tools.list().some((t) => t.name === "leads.update_status")).toBe(true);
    expect(owner.tools.list().some((t) => t.name === "leads.restore_notes")).toBe(false);
    expect(owner.tools.list().some((t) => t.name === "leads.delete_task")).toBe(false);

    const routine = await build(run({ source: "routine" }));
    expect(routine.tools.list().some((t) => t.name === "leads.update_status")).toBe(false);
    expect(routine.tools.list().some((t) => t.name === "leads.list")).toBe(true);
    const refused = await routine.tools.run({
      name: "leads.update_status",
      args: { leadId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: "contacted" },
      requestId: "r-write",
      stepId: "s-write",
    });
    expect(refused).toMatchObject({ ok: false, reason: "forbidden", tool: "leads.update_status" });

    const noExt = await build(
      run({
        source: "owner",
        checkpoint: { routine: { send_policy: "no_external_actions" } },
      }),
    );
    expect(noExt.tools.list().some((t) => t.name === "automations.toggle")).toBe(false);
  });
});

describe("flag on: the kill switches stop a run", () => {
  it("the global switch (AGENT_RUNS_DISABLED) stops a run before any model call", async () => {
    const s = setup({
      loop: [{ final: { status: "done", summary: "x" } }],
      limitsEnv: { AGENT_RUNS_DISABLED: "1" },
    });
    await ensureAgentLoopInstalled(s.installDeps);
    const out = await getAgentRunExecutor()!(s.ctxFor(run()).ctx);
    expect(out.status).toBe("cancelled");
    expect(s.model.call).not.toHaveBeenCalled();
    expect(s.g.limits.ledger.admit).not.toHaveBeenCalled();
  });

  it("the workspace switch turned off mid-run stops it before the next step and releases the slot", async () => {
    let reads = 0;
    const s = setup({
      loop: [
        { tool: "leads.list", args: {}, why: "a" },
        { tool: "leads.list", args: {}, why: "b" },
        { tool: "leads.list", args: {}, why: "c" },
        { final: { status: "done", summary: "x" } },
      ],
    });
    s.installDeps.client = (org) => {
      reads += 1;
      if (reads === 1) s.g.state.killed = true; // the owner flips the switch while the first tool is running
      return workspaceReadClient(s.rec.admin, org);
    };
    await ensureAgentLoopInstalled(s.installDeps);
    const out = await getAgentRunExecutor()!(s.ctxFor(run()).ctx);
    expect(out.status).toBe("cancelled");
    expect(reads).toBe(1);
    expect(s.g.log.at(-1)).toBe("finished");
    expect(s.mem.tables.business_memory).toHaveLength(0);
  });

  it("the sweep runs with the flag on", async () => {
    const s = setup({
      loop: [{ final: { status: "done", summary: "x" } }],
      limitsEnv: { AGENT_RUNS_DISABLED: "1" },
    });
    await sweepAgentKillSwitches({ env: s.installDeps.env!, limits: s.g.limits });
    expect(s.g.limits.ledger.cancelQueued).toHaveBeenCalled();
  });
});

describe("the workspace-pinned read client", () => {
  it("pins every select to the run's workspace and refuses writes", () => {
    const rec = recordingAdmin();
    const client = workspaceReadClient(rec.admin, ORG);
    (client.from("leads") as { select: (c: string) => unknown }).select("id");
    expect(rec.filters).toEqual([["organization_id", ORG]]);
    for (const verb of ["insert", "update", "delete", "upsert", "rpc"])
      expect(() => (client.from("leads") as Record<string, () => unknown>)[verb]!()).toThrow(
        /read-only/,
      );
    expect(rec.writes).toEqual([]);
  });
});
