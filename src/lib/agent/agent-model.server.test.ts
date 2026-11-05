import { describe, expect, it, vi } from "vitest";
import { createAskModel, type ModelCall, type ModelPricing } from "@/lib/agent/agent-model.server";
import { LoopBudgetError } from "@/lib/agent/loop.server";
import type { AgentRun } from "@/lib/agent/run-store.server";

const run = (over: Partial<AgentRun> = {}): AgentRun => ({
  id: "r1",
  organization_id: "o1",
  user_id: "u1",
  goal: "g",
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
const pricing: ModelPricing = {
  estimate: () => 100,
  cost: () => 60,
  failureCharge: (_e, est) => est,
};
const ledger = () => ({
  reserve: vi.fn(async () => ({ allowed: true })),
  settle: vi.fn(async () => undefined),
});
const ask0 = run();
const ok: ModelCall = async () => ({
  data: { final: 1 },
  usage: { inputTokens: 10, outputTokens: 5 },
});

describe("agent loop model turn", () => {
  it("reserves once, calls the model with the system prompt first, settles the real cost", async () => {
    const l = ledger();
    const call = vi.fn(ok);
    const ask = createAskModel(run(), {
      call,
      pricing,
      ledger: l as never,
      capFor: async () => 1000,
    });
    const out = await ask({
      system: "SYS",
      messages: [{ role: "user", content: "hi" }],
      run: ask0,
    });
    expect(out).toEqual({ data: { final: 1 }, costMicrocents: 60 });
    expect(call.mock.calls[0]![0].messages).toEqual([
      { role: "system", content: "SYS" },
      { role: "user", content: "hi" },
    ]);
    expect(call.mock.calls[0]![0]).toMatchObject({ organizationId: "o1", userId: "u1" });
    expect(l.reserve).toHaveBeenCalledTimes(1);
    expect(l.settle).toHaveBeenCalledTimes(1);
  });

  it("stops with a spending-limit error once the run's own ceiling would be passed, and makes no model call", async () => {
    const call = vi.fn(ok);
    const ask = createAskModel(run({ budget_cap: 150, budget_used: 100 }), {
      call,
      pricing,
      ledger: ledger() as never,
      capFor: async () => 99999,
    });
    await expect(ask({ system: "s", messages: [], run: ask0 })).rejects.toBeInstanceOf(
      LoopBudgetError,
    );
    expect(call).not.toHaveBeenCalled();
  });

  it("uses the workspace limit when the run has no ceiling, and settles a failed call", async () => {
    const l = ledger();
    const capFor = vi.fn(async () => 1000);
    const boom: ModelCall = async () => {
      throw new Error("provider down");
    };
    const ask = createAskModel(run(), { call: boom, pricing, ledger: l as never, capFor });
    await expect(ask({ system: "s", messages: [], run: ask0 })).rejects.toThrow("provider down");
    expect(capFor).toHaveBeenCalledTimes(1);
    expect(l.settle).toHaveBeenCalledTimes(1);
  });
});
