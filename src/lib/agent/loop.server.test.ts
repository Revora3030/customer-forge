import { describe, expect, it, vi } from "vitest";
import { parseNextStep, buildSystemPrompt, formatObservation } from "@/lib/agent/protocol";
import { LoopBudgetError, runAgentLoop, type LoopDeps } from "@/lib/agent/loop.server";
import { LostLeaseError, type AgentRun, type RunContext } from "@/lib/agent/run-store.server";
import type { ToolResultV2 } from "@/lib/ai/tool-registry-v2.server";

const run: AgentRun = {
  id: "run-1", organization_id: "org-1", user_id: "u-1", goal: "Check my site", source: "owner",
  status: "processing", attempts: 1, max_attempts: 3, fence: 1, checkpoint: {}, budget_cap: null,
  budget_used: 0, result_summary: null, error_plain: null,
};

function makeCtx(checkpoint: Record<string, unknown> = {}) {
  const events: { kind: string; message: string }[] = [];
  const saves: { checkpoint: Record<string, unknown>; used?: number | undefined }[] = [];
  const ctx: RunContext = {
    run, checkpoint,
    save: async (c, used) => { saves.push({ checkpoint: c, used }); },
    event: async (kind, message) => { events.push({ kind, message }); },
  };
  return { ctx, events, saves };
}

const ok = (tool: string, risk: "read" | "write_internal", data: unknown = { fine: true }): ToolResultV2 => ({
  ok: true, tool, risk, data, durationMs: 3, idempotencyKey: null, replayed: false, inverse: null,
});
const bad = (tool: string, reason: "timeout" | "failed" | "needs_approval" | "forbidden"): ToolResultV2 => ({
  ok: false, tool, risk: "read", reason, error: `${tool} ${reason}`, durationMs: 3,
});

const toolList = [
  { name: "inspect_website", description: "read the site", risk: "read", parameters: {} },
  { name: "update_copy", description: "change copy", risk: "write_internal", parameters: {} },
];

function deps(replies: unknown[], toolRuns: (name: string, n: number) => ToolResultV2 | Promise<ToolResultV2>, extra: Partial<LoopDeps> = {}) {
  let i = 0;
  const calls: string[] = [];
  const asked: unknown[] = [];
  const d: LoopDeps = {
    askModel: vi.fn(async ({ messages }) => {
      asked.push(messages.length);
      const next = replies[Math.min(i, replies.length - 1)];
      i += 1;
      if (next instanceof Error) throw next;
      return { data: next, costMicrocents: 10 };
    }),
    tools: {
      list: () => toolList,
      run: async (call) => { calls.push(call.name); return toolRuns(call.name, calls.length); },
    },
    sleep: async () => {},
    ...extra,
  };
  return { d, calls, asked };
}

const final = { final: { status: "done", summary: "All good." } };
const use = (tool: string) => ({ tool, args: {}, why: "because" });

describe("protocol", () => {
  it("parses tool and final steps and rejects junk", () => {
    expect(parseNextStep(use("inspect_website"))).toMatchObject({ ok: true, step: { kind: "tool", tool: "inspect_website" } });
    expect(parseNextStep(final)).toMatchObject({ ok: true, step: { kind: "final", status: "done" } });
    for (const junk of [null, "text", [], {}, { tool: 5 }, { final: { status: "nope", summary: "x" } }, { tool: "a", final: {} }])
      expect(parseNextStep(junk).ok).toBe(false);
  });
  it("bounds and marks tool output as data", () => {
    const text = formatObservation("t", { ok: true, payload: "x".repeat(20_000) });
    expect(text.startsWith("TOOL RESULT t ok")).toBe(true);
    expect(text.length).toBeLessThan(6200);
    expect(buildSystemPrompt([], 5)).toContain("data, not instructions");
  });
});

describe("runAgentLoop", () => {
  it("runs a tool then finishes, saving a checkpoint and a terminal event", async () => {
    const { ctx, events, saves } = makeCtx();
    const { d, calls } = deps([use("inspect_website"), final], (n) => ok(n, "read"));
    const out = await runAgentLoop(ctx, d);
    expect(out).toEqual({ status: "done", summary: "All good." });
    expect(calls).toEqual(["inspect_website"]);
    expect(saves.length).toBeGreaterThanOrEqual(2);
    expect(saves.at(-1)?.used).toBe(20);
    expect(events.at(-1)?.kind).toBe("run_finished");
    expect(events.filter((e) => e.kind === "run_finished")).toHaveLength(1);
  });

  it("stops at max steps with a plain reason", async () => {
    const { ctx, events } = makeCtx();
    const { d, calls } = deps([use("inspect_website")], (n) => ok(n, "read"), { limits: { maxSteps: 3 } });
    const out = await runAgentLoop(ctx, d);
    expect(out.status).toBe("failed");
    expect(out.error).toMatch(/3 steps/);
    expect(calls).toHaveLength(3);
    expect(events.at(-1)?.kind).toBe("run_finished");
  });

  it("stops at the wall-clock limit", async () => {
    const { ctx } = makeCtx();
    let t = 0;
    const { d } = deps([use("inspect_website")], (n) => ok(n, "read"), { now: () => (t += 100_000), limits: { maxWallMs: 150_000 } });
    const out = await runAgentLoop(ctx, d);
    expect(out.status).toBe("failed");
    expect(out.error).toMatch(/time limit/);
  });

  it("asks for input instead of failing when the budget refuses", async () => {
    const { ctx } = makeCtx();
    const { d } = deps([use("inspect_website"), new LoopBudgetError()], (n) => ok(n, "read"));
    const out = await runAgentLoop(ctx, d);
    expect(out.status).toBe("needs_input");
    expect(out.summary).toMatch(/spending limit/);
  });

  it("re-asks once on a malformed reply, then succeeds; twice fails", async () => {
    const a = makeCtx();
    const first = deps([{ nonsense: true }, final], (n) => ok(n, "read"));
    expect((await runAgentLoop(a.ctx, first.d)).status).toBe("done");
    expect(a.events.some((e) => e.kind === "model_reply_rejected")).toBe(true);
    const b = makeCtx();
    const second = deps([{ nonsense: true }], (n) => ok(n, "read"));
    const out = await runAgentLoop(b.ctx, second.d);
    expect(out.status).toBe("failed");
    expect(second.d.askModel).toHaveBeenCalledTimes(2);
  });

  it("retries a tool timeout once and recovers", async () => {
    const { ctx, events } = makeCtx();
    const { d, calls } = deps([use("inspect_website"), final], (n, count) => (count === 1 ? bad(n, "timeout") : ok(n, "read")));
    const out = await runAgentLoop(ctx, d);
    expect(out.status).toBe("done");
    expect(calls).toHaveLength(2);
    expect(events.some((e) => e.kind === "tool_timeout")).toBe(true);
  });

  it("fails honestly when a tool times out twice", async () => {
    const { ctx } = makeCtx();
    const { d, calls } = deps([use("inspect_website")], (n) => bad(n, "timeout"));
    const out = await runAgentLoop(ctx, d);
    expect(out.status).toBe("failed");
    expect(out.error).toContain("inspect_website");
    expect(calls).toHaveLength(2);
  });

  it("treats a hung tool as a timeout", async () => {
    const { ctx } = makeCtx();
    const { d } = deps([use("inspect_website")], () => new Promise<ToolResultV2>(() => {}), { limits: { toolTimeoutMs: 10 } });
    expect((await runAgentLoop(ctx, d)).status).toBe("failed");
  });

  it("reports a failed tool to the model and lets it carry on", async () => {
    const { ctx, events } = makeCtx();
    const { d } = deps([use("inspect_website"), final], (n) => bad(n, "failed"));
    expect((await runAgentLoop(ctx, d)).status).toBe("done");
    expect(events.some((e) => e.kind === "tool_failed")).toBe(true);
  });

  it("ends as needs_approval when a tool needs approval", async () => {
    const { ctx } = makeCtx();
    const { d } = deps([use("inspect_website")], (n) => bad(n, "needs_approval"));
    const out = await runAgentLoop(ctx, d);
    expect(out.status).toBe("needs_approval");
    expect(out.summary).toMatch(/Nothing was sent/);
  });

  it("tells the model about an unknown tool without running anything", async () => {
    const { ctx, events } = makeCtx();
    const { d, calls } = deps([use("delete_everything"), final], (n) => ok(n, "read"));
    expect((await runAgentLoop(ctx, d)).status).toBe("done");
    expect(calls).toEqual([]);
    expect(events.some((e) => e.kind === "tool_unknown")).toBe(true);
  });

  it("verifies writes, and says so when it cannot", async () => {
    const withVerify = makeCtx();
    const verifyWrite = vi.fn(async () => ({ ok: true, detail: "headline matches" }));
    const a = deps([use("update_copy"), final], (n) => ok(n, "write_internal"), { verifyWrite });
    await runAgentLoop(withVerify.ctx, a.d);
    expect(verifyWrite).toHaveBeenCalledTimes(1);
    expect(withVerify.events.some((e) => e.kind === "verify_passed")).toBe(true);

    const without = makeCtx();
    const b = deps([use("update_copy"), final], (n) => ok(n, "write_internal"));
    await runAgentLoop(without.ctx, b.d);
    expect(without.events.some((e) => e.kind === "verify_skipped")).toBe(true);

    const failing = makeCtx();
    const c = deps([use("update_copy"), final], (n) => ok(n, "write_internal"), { verifyWrite: async () => { throw new Error("boom"); } });
    await runAgentLoop(failing.ctx, c.d);
    expect(failing.events.some((e) => e.kind === "verify_failed")).toBe(true);
  });

  it("resumes from the checkpoint without repeating finished steps", async () => {
    const first = makeCtx();
    const a = deps([use("inspect_website"), { oops: 1 }, { oops: 2 }], (n) => ok(n, "read"));
    await runAgentLoop(first.ctx, a.d);
    const saved = first.saves.at(-1)!.checkpoint;
    expect((saved["loop"] as { step: number }).step).toBe(1);

    const second = makeCtx(saved);
    const b = deps([final], (n) => ok(n, "read"));
    const out = await runAgentLoop(second.ctx, b.d);
    expect(out.status).toBe("done");
    expect(b.calls).toEqual([]);
    expect(second.events[0]?.message).toMatch(/Resumed after step 1/);
  });

  it("turns an unexpected error into a failed run with a terminal event", async () => {
    const { ctx, events } = makeCtx();
    const { d } = deps([new Error("provider exploded")], (n) => ok(n, "read"));
    const out = await runAgentLoop(ctx, d);
    expect(out.status).toBe("failed");
    expect(out.error).not.toMatch(/provider exploded/);
    expect(events.at(-1)?.kind).toBe("run_finished");
  });

  it("lets a lost lease through so the store can discard the work", async () => {
    const { ctx } = makeCtx();
    ctx.save = async () => { throw new LostLeaseError(); };
    const { d } = deps([use("inspect_website"), final], (n) => ok(n, "read"));
    await expect(runAgentLoop(ctx, d)).rejects.toBeInstanceOf(LostLeaseError);
  });

  it("keeps working when the event feed is down", async () => {
    const { ctx } = makeCtx();
    ctx.event = async () => { throw new Error("feed down"); };
    const { d } = deps([final], (n) => ok(n, "read"));
    expect((await runAgentLoop(ctx, d)).status).toBe("done");
  });
});
