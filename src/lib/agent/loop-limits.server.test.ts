import { describe, expect, it, vi } from "vitest";
import { runAgentLoop, type LoopDeps } from "@/lib/agent/loop.server";
import type { AdmitResult, LimitsDeps } from "@/lib/agent/limits.server";
import { LostLeaseError, type AgentRun, type RunContext } from "@/lib/agent/run-store.server";
import type { ToolResultV2 } from "@/lib/ai/tool-registry-v2.server";

const run: AgentRun = {
  id: "run-1", organization_id: "org-1", user_id: "u-1", goal: "Check my site", source: "owner",
  status: "processing", attempts: 1, max_attempts: 3, fence: 1, checkpoint: {}, budget_cap: null,
  budget_used: 0, result_summary: null, error_plain: null,
};
const ok: ToolResultV2 = { ok: true, tool: "inspect_website", risk: "read", data: {}, durationMs: 1, idempotencyKey: null, replayed: false, inverse: null };

function ctx(eventImpl?: RunContext["event"]) {
  const events: string[] = [];
  const c: RunContext = { run, checkpoint: {}, save: async () => {}, event: eventImpl ?? (async (kind) => { events.push(kind); }) };
  return { c, events };
}

function gate(opts: { admit?: Partial<AdmitResult>; enabled?: boolean[]; env?: Record<string, string>; settingsThrow?: boolean } = {}) {
  const log: string[] = [];
  let reads = 0;
  const enabled = opts.enabled ?? [true];
  const g: LimitsDeps = {
    env: opts.env ?? {},
    store: {
      getSettings: vi.fn(async () => {
        if (opts.settingsThrow && reads > 0) throw new Error("db down");
        const e = enabled[Math.min(reads, enabled.length - 1)]!;
        reads += 1;
        return { enabled: e, reason: null };
      }),
      getOverrides: async () => ({}),
      listDisabledOrganizations: async () => [],
    },
    ledger: {
      admit: vi.fn(async () => { log.push("admit"); return { admitted: true, reason: "ok", inFlight: 1, runsLastHour: 1, ...opts.admit } as AdmitResult; }),
      markStarted: vi.fn(async () => { log.push("started"); return true; }),
      markFinished: vi.fn(async () => { log.push("finished"); return true; }),
      cancelQueued: vi.fn(async () => []),
    },
    toolCalls: { countSince: vi.fn(async () => 0) },
  };
  return { g, log };
}

function loopDeps(replies: unknown[], runLimits: LimitsDeps, toolRun = vi.fn(async () => ok)): LoopDeps {
  let i = 0;
  return {
    askModel: vi.fn(async () => ({ data: replies[Math.min(i++, replies.length - 1)] })),
    tools: { list: () => [{ name: "inspect_website", description: "read", risk: "read", parameters: {} }], run: toolRun },
    sleep: async () => {},
    runLimits,
  };
}
const final = { final: { status: "done", summary: "All good." } };
const use = { tool: "inspect_website", args: {}, why: "look" };

describe("PAI-5 run limits in the agent loop", () => {
  it("admits, marks started, runs, and releases the slot on finish", async () => {
    const { g, log } = gate();
    const out = await runAgentLoop(ctx().c, loopDeps([use, final], g));
    expect(out).toMatchObject({ status: "done" });
    expect(log).toEqual(["admit", "started", "finished"]);
    expect(g.ledger.admit).toHaveBeenCalledWith("org-1", "run-1", expect.objectContaining({ maxConcurrentRuns: 3, maxRunsPerHour: 10 }));
  });

  it("global kill switch: cancelled before any model call, nothing admitted", async () => {
    const { g, log } = gate({ env: { AGENT_RUNS_DISABLED: "1" } });
    const d = loopDeps([final], g);
    const { c, events } = ctx();
    const out = await runAgentLoop(c, d);
    expect(out.status).toBe("cancelled");
    expect(out.summary).toMatch(/paused/);
    expect(d.askModel).not.toHaveBeenCalled();
    expect(log).not.toContain("admit");
    expect(events).toContain("run_refused");
  });

  it("workspace switch off: cancelled, no model call", async () => {
    const { g } = gate({ enabled: [false] });
    const d = loopDeps([final], g);
    const out = await runAgentLoop(ctx().c, d);
    expect(out).toMatchObject({ status: "cancelled" });
    expect(d.askModel).not.toHaveBeenCalled();
  });

  it.each([
    ["too_many_running", /already working on 3/],
    ["hourly_limit", /10 Revora AI runs per hour/],
  ] as const)("%s refuses the run with a plain message and no model call", async (reason, msg) => {
    const { g, log } = gate({ admit: { admitted: false, reason } });
    const d = loopDeps([final], g);
    const out = await runAgentLoop(ctx().c, d);
    expect(out.status).toBe("failed");
    expect(out.error).toMatch(msg);
    expect(d.askModel).not.toHaveBeenCalled();
    expect(log).not.toContain("started");
  });

  it("a kill switch turned on mid-run stops before the next step and releases the slot", async () => {
    const { g, log } = gate({ enabled: [true, true, false] });
    const toolRun = vi.fn(async () => ok);
    const out = await runAgentLoop(ctx().c, loopDeps([use, use, use, final], g, toolRun));
    expect(out.status).toBe("cancelled");
    expect(out.summary).toMatch(/turned off/);
    expect(toolRun).toHaveBeenCalledTimes(1);
    expect(log.at(-1)).toBe("finished");
  });

  it("a failed settings read mid-run does not kill the run", async () => {
    const { g } = gate({ settingsThrow: true });
    expect((await runAgentLoop(ctx().c, loopDeps([use, final], g))).status).toBe("done");
  });

  it("does not release the slot when the lease is lost (another worker owns the run)", async () => {
    const { g, log } = gate();
    const c = ctx(async (kind) => { if (kind === "tool_started") throw new LostLeaseError(); }).c;
    await expect(runAgentLoop(c, loopDeps([use, final], g))).rejects.toBeInstanceOf(LostLeaseError);
    expect(log).toEqual(["admit", "started"]);
  });

  it("releases the slot on an unexpected failure too", async () => {
    const { g, log } = gate();
    const d = loopDeps([use], g);
    d.askModel = vi.fn(async () => { throw new Error("boom"); });
    expect((await runAgentLoop(ctx().c, d)).status).toBe("failed");
    expect(log.at(-1)).toBe("finished");
  });

  it("does not count tool calls itself (registry tools are limited by #739)", async () => {
    const { g } = gate();
    await runAgentLoop(ctx().c, loopDeps([use, use, final], g));
    expect(g.toolCalls.countSince).not.toHaveBeenCalled();
  });

  it("without runLimits the loop behaves exactly as before", async () => {
    const d = loopDeps([final], undefined as unknown as LimitsDeps);
    delete d.runLimits;
    expect((await runAgentLoop(ctx().c, d)).status).toBe("done");
  });
});

describe("executor wiring", () => {
  it("createAgentLoopExecutor applies the run gate by default", async () => {
    const { createAgentLoopExecutor } = await import("@/lib/agent/loop.server");
    const { g, log } = gate();
    const d = loopDeps([final], g);
    delete d.runLimits;
    const out = await createAgentLoopExecutor(() => d, () => g)(ctx().c);
    expect(out.status).toBe("done");
    expect(log).toEqual(["admit", "started", "finished"]);
  });
});
