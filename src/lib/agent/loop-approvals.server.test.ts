import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runAgentLoop, type LoopDeps } from "@/lib/agent/loop.server";
import { createAgentApprovalWiring, describeApproval } from "@/lib/agent/loop-approvals.server";
import {
  decideApproval,
  type ApprovalDeps,
  type ApprovalRepo,
  type ApprovalRow,
} from "@/lib/agent/approvals.server";
import type { LimitsDeps } from "@/lib/agent/limits.server";
import type { AgentRun, RunContext } from "@/lib/agent/run-store.server";
import {
  createToolRegistryV2,
  defineToolV2,
  type ToolContextV2,
} from "@/lib/ai/tool-registry-v2.server";
import { withAgentLimits } from "@/lib/agent/tools/guard";
import { agentTools } from "@/lib/agent/tools";

const ORG = "11111111-1111-4111-8111-111111111111";
const OWNER = "33333333-3333-4333-8333-333333333333";
const APPT = "66666666-6666-4666-8666-666666666666";

const run: AgentRun = {
  id: "run-1",
  organization_id: ORG,
  user_id: OWNER,
  goal: "Ask Dana for a review",
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
};

/** In-memory copy of the approval rules the loop relies on (same shape as approvals.server.test.ts). */
function memoryRepo() {
  const rows: ApprovalRow[] = [];
  let seq = 0;
  const live = (r: ApprovalRow) => r.status === "pending" || r.status === "approved";
  const same = (r: ApprovalRow, org: string | null, tool: string, hash: string) =>
    r.organization_id === org && r.tool === tool && r.args_hash === hash;
  const repo: ApprovalRepo = {
    async request(i) {
      const found = rows.find((r) => live(r) && same(r, i.organizationId, i.tool, i.argsHash));
      if (found) return { approval: found, created: false };
      const row: ApprovalRow = {
        id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
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
      };
      rows.push(row);
      return { approval: row, created: true };
    },
    async decide(id, _decider, approve) {
      const r = rows.find((x) => x.id === id);
      if (!r) return { outcome: "not_found", approval: null };
      if (r.status !== "pending") return { outcome: "already_decided", approval: r };
      r.status = approve ? "approved" : "rejected";
      return { outcome: approve ? "approved" : "rejected", approval: r };
    },
    async consume(i) {
      const hit = rows.find(
        (r) => r.status === "approved" && same(r, i.organizationId, i.tool, i.argsHash),
      );
      if (hit) {
        hit.status = "consumed";
        return { outcome: "consumed", approval: hit };
      }
      const r = [...rows].reverse().find((x) => same(x, i.organizationId, i.tool, i.argsHash));
      if (!r) return { outcome: "not_found", approval: null };
      return {
        outcome:
          r.status === "rejected" ? "rejected" : r.status === "consumed" ? "used" : "not_approved",
        approval: null,
      };
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

function limitsGate() {
  const getSettings = vi.fn(async () => ({ enabled: true, reason: null }));
  const g = {
    env: {},
    store: {
      getSettings,
      getOverrides: async () => ({}),
      listDisabledOrganizations: async () => [],
    },
    ledger: { admit: vi.fn(), markStarted: vi.fn(), markFinished: vi.fn(), cancelQueued: vi.fn() },
    toolCalls: { countSince: vi.fn(async () => 0) },
  } as unknown as LimitsDeps;
  return { g, counted: () => getSettings.mock.calls.length };
}

/** The real registry with one send_external tool, wrapped in the PAI-5 limits exactly once. */
function harness() {
  const { repo, rows } = memoryRepo();
  const approvalDeps: ApprovalDeps = { repo };
  const wiring = createAgentApprovalWiring(approvalDeps);
  const send = vi.fn(async () => ({ queued: 1 }));
  const tool = defineToolV2({
    name: "reviews.request",
    description: "Ask for a review",
    risk: "send_external",
    scope: "owner",
    schema: z.strictObject({ appointmentId: z.string().uuid(), channel: z.enum(["email", "sms"]) }),
    run: send,
  });
  const gate = limitsGate();
  const registry = createToolRegistryV2(withAgentLimits([tool] as never, gate.g), {
    audit: async () => {},
    approvals: wiring.registry,
  });
  const context = {
    supabase: {},
    userId: OWNER,
    organizationId: ORG,
    isSuperAdmin: false,
  } as unknown as ToolContextV2;
  const events: string[] = [];
  const saved: Record<string, unknown>[] = [];
  const ctxFor = (checkpoint: Record<string, unknown> = {}): RunContext => ({
    run,
    checkpoint,
    save: async (c) => {
      saved.push(c);
    },
    event: async (kind) => {
      events.push(kind);
    },
  });
  const deps = (replies: unknown[], extra: Partial<LoopDeps> = {}): LoopDeps => {
    let i = 0;
    return {
      askModel: vi.fn(async () => ({ data: replies[Math.min(i++, replies.length - 1)] })),
      tools: {
        list: () => [
          { name: "reviews.request", description: "d", risk: "send_external", parameters: {} },
        ],
        run: (call) =>
          registry.run(
            { ...context, runId: run.id, stepId: call.stepId },
            { name: call.name, arguments: call.args, requestId: call.requestId },
          ),
      },
      approvals: wiring.loop,
      sleep: async () => {},
      ...extra,
    };
  };
  return { rows, approvalDeps, send, gate, ctxFor, deps, events, saved };
}

const args = { appointmentId: APPT, channel: "sms" };
const use = { tool: "reviews.request", args, why: "Ask Dana for a review after her job" };
const final = { final: { status: "done", summary: "Done." } };
const lastCheckpoint = (saved: Record<string, unknown>[]) => saved[saved.length - 1]!;

describe("PAI-4 approvals in the agent loop", () => {
  it("files an approval for the exact arguments, pauses, and sends nothing", async () => {
    const h = harness();
    const out = await runAgentLoop(h.ctxFor(), h.deps([use, final]));
    expect(out.status).toBe("needs_approval");
    expect(out.summary).toMatch(/Waiting for your approval.*Nothing was sent/);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0]).toMatchObject({
      organization_id: ORG,
      scope: "owner",
      tool: "reviews.request",
      run_id: "run-1",
      step_id: "run-1:1",
      requested_by: OWNER,
      args,
      status: "pending",
    });
    expect(h.gate.counted()).toBe(0); // a refused call never reaches the limits wrapper
    const loop = lastCheckpoint(h.saved)["loop"] as {
      approval: { tool: string; approvalId: string };
    };
    expect(loop.approval).toMatchObject({ tool: "reviews.request", approvalId: h.rows[0]!.id });
  });

  it("the workspace comes from the run, never from the model", async () => {
    const h = harness();
    await runAgentLoop(
      h.ctxFor(),
      h.deps([
        {
          tool: "reviews.request",
          args: { ...args, organizationId: "99999999-9999-4999-8999-999999999999" },
        },
        final,
      ]),
    );
    expect(h.rows).toHaveLength(0); // the registry refuses it before any approval is asked for
    expect(h.send).not.toHaveBeenCalled();
  });

  it("after the owner approves, the resumed run sends once, counted once, and uses the approval up", async () => {
    const h = harness();
    await runAgentLoop(h.ctxFor(), h.deps([use, final]));
    const decided = await decideApproval(h.approvalDeps, {
      approvalId: h.rows[0]!.id,
      deciderId: OWNER,
      decision: "approve",
    });
    expect(decided.ok).toBe(true);
    const out = await runAgentLoop(h.ctxFor(lastCheckpoint(h.saved)), h.deps([use, final]));
    expect(out.status).toBe("done");
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.gate.counted()).toBe(1);
    expect(h.rows[0]!.status).toBe("consumed");
    // a third attempt with the same arguments needs a new approval
    const again = await runAgentLoop(h.ctxFor(), h.deps([use, final]));
    expect(again.status).toBe("needs_approval");
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.rows).toHaveLength(2);
  });

  it("a declined approval is not asked for again and the model is told it was not sent", async () => {
    const h = harness();
    await runAgentLoop(h.ctxFor(), h.deps([use, final]));
    await decideApproval(h.approvalDeps, {
      approvalId: h.rows[0]!.id,
      deciderId: OWNER,
      decision: "reject",
    });
    const d = h.deps([use, final]);
    const out = await runAgentLoop(h.ctxFor(lastCheckpoint(h.saved)), d);
    expect(out.status).toBe("done");
    expect(h.send).not.toHaveBeenCalled();
    expect(h.rows).toHaveLength(1);
    expect(h.events).toContain("approval_not_granted");
    const lastMessages = (d.askModel as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0]
      .messages as { content: string }[];
    expect(lastMessages.some((m) => /did not approve/.test(m.content))).toBe(true);
  });

  it("changed arguments after approval are a different action and need their own approval", async () => {
    const h = harness();
    await runAgentLoop(h.ctxFor(), h.deps([use, final]));
    await decideApproval(h.approvalDeps, {
      approvalId: h.rows[0]!.id,
      deciderId: OWNER,
      decision: "approve",
    });
    const changed = { ...use, args: { ...args, channel: "email" } };
    const out = await runAgentLoop(h.ctxFor(lastCheckpoint(h.saved)), h.deps([changed, final]));
    expect(out.status).toBe("needs_approval");
    expect(h.send).not.toHaveBeenCalled();
    expect(h.rows).toHaveLength(2);
    expect(h.rows[0]!.status).toBe("approved");
  });

  it("if the request can't be saved, the model is told nothing was sent and the run goes on", async () => {
    const h = harness();
    h.approvalDeps.repo.request = async () => {
      throw new Error("db down");
    };
    const out = await runAgentLoop(h.ctxFor(), h.deps([use, final]));
    expect(out.status).toBe("done");
    expect(h.send).not.toHaveBeenCalled();
    expect(h.events).toContain("approval_request_failed");
  });

  it("without the approvals hook the run still just ends as needs_approval", async () => {
    const h = harness();
    const out = await runAgentLoop(
      h.ctxFor(),
      h.deps([use, final], { approvals: undefined as never }),
    );
    expect(out).toMatchObject({
      status: "needs_approval",
      summary: expect.stringMatching(/Nothing was sent/),
    });
    expect(h.rows).toHaveLength(0);
  });

  it("a pending marker only lasts one step", async () => {
    const h = harness();
    await runAgentLoop(h.ctxFor(), h.deps([use, final]));
    const out = await runAgentLoop(h.ctxFor(lastCheckpoint(h.saved)), h.deps([final]));
    expect(out.status).toBe("done");
    expect((lastCheckpoint(h.saved)["loop"] as { approval: unknown }).approval).toBeNull();
  });
});

describe("limits are counted once for the registered send tools", () => {
  it("agentTools() includes the send tools, wrapped exactly once", async () => {
    const gate = limitsGate();
    const tools = agentTools(gate.g);
    const send = tools.find((t) => t.name === "reviews.request")!;
    expect(send.risk).toBe("send_external");
    expect(tools.filter((t) => t.name === "reviews.request")).toHaveLength(1);
    const context = {
      supabase: {},
      userId: OWNER,
      organizationId: ORG,
      isSuperAdmin: false,
    } as unknown as ToolContextV2;
    // the run fails later (no database here); the limits gate must still have been asked exactly once
    await send.run({ appointmentId: APPT, channel: "sms" }, context).catch(() => undefined);
    expect(gate.counted()).toBe(1);
  });
});

describe("describeApproval", () => {
  it("is one plain sentence", () => {
    expect(describeApproval("reviews.request", "  ask\nDana ")).toBe("ask Dana (reviews.request)");
    expect(describeApproval("reviews.request")).toBe("Run reviews.request.");
  });
});
