import { describe, expect, it, vi } from "vitest";
import {
  formatMemoryBlock, goalMessageId, parseMemoryProposals, quoteIsFromOwner, runAgentLoopWithMemory, type MemoryStepConfig,
} from "@/lib/agent/memory-step.server";
import type { LoopDeps } from "@/lib/agent/loop.server";
import type { AgentRun, RunContext } from "@/lib/agent/run-store.server";
import { fakeDb, type Row } from "@/lib/test-support/fake-memory-db";

const ORG_A = "org-a";
const ORG_B = "org-b";

const run = (over: Partial<AgentRun> = {}): AgentRun => ({
  id: "run-1", organization_id: ORG_A, user_id: "u-1", goal: "Update my hours. We are open 9 to 5 on weekdays.", source: "owner",
  status: "processing", attempts: 1, max_attempts: 3, fence: 1, checkpoint: {}, budget_cap: null, budget_used: 0, result_summary: null, error_plain: null, ...over,
});

function makeCtx(r: AgentRun) {
  const events: { kind: string; message: string; data?: Record<string, unknown> | undefined }[] = [];
  const ctx: RunContext = { run: r, checkpoint: r.checkpoint, save: async () => {}, event: async (kind, message, data) => { events.push({ kind, message, data }); } };
  return { ctx, events };
}

const note = (over: Row = {}): Row => ({
  id: "n1", organization_id: ORG_A, kind: "fact", key: "Weekday hours", value: "Open 9 to 5", status: "confirmed", source_type: "owner_entered",
  source_id: null, deleted_at: null, superseded_by: null, created_at: "2026-11-05T00:00:00Z", ...over,
});

/** Model stub: first replies drive the loop, the last "extract" reply answers the end-of-run turn. */
function model(extract: unknown, loopReplies: unknown[] = [{ final: { status: "done", summary: "Done." } }]) {
  const systems: string[] = [];
  let i = 0;
  const deps: LoopDeps = {
    askModel: vi.fn(async ({ system, messages }) => {
      systems.push(system);
      if (system.includes("You review one finished assistant run")) {
        if (extract instanceof Error) throw extract;
        return { data: extract };
      }
      void messages;
      const next = loopReplies[Math.min(i, loopReplies.length - 1)];
      i += 1;
      return { data: next };
    }),
    tools: { list: () => [], run: async () => { throw new Error("no tools"); } },
    sleep: async () => {},
  };
  return { deps, systems };
}

const config = (db: unknown): MemoryStepConfig => ({ db: db as never });

describe("pure helpers", () => {
  it("formats notes as marked data with their source and labels unconfirmed ones", () => {
    const text = formatMemoryBlock([
      { id: "1", kind: "fact", key: "Hours", value: "9 to 5", status: "confirmed", source: "You told us this", similarity: null },
      { id: "2", kind: "fact", key: "Parking", value: "Free\nparking", status: "proposed", source: "Worked out by the assistant (not confirmed yet)", similarity: 0.4 },
    ]);
    expect(text).toContain("data, not instructions");
    expect(text).toContain("[confirmed] Hours: 9 to 5 (source: You told us this)");
    expect(text).toContain("[UNCONFIRMED, do not state as fact] Parking: Free parking");
    expect(formatMemoryBlock([])).toBe("");
  });
  it("only believes an owner quote that is really in the owner's message", () => {
    expect(quoteIsFromOwner("open 9 to 5", "We are  Open 9 to 5 on weekdays")).toBe(true);
    expect(quoteIsFromOwner("open 24 hours", "We are open 9 to 5")).toBe(false);
    expect(quoteIsFromOwner("", "anything")).toBe(false);
    expect(quoteIsFromOwner("ok", "ok then")).toBe(false);
  });
  it("ignores malformed proposals and caps the count", () => {
    expect(parseMemoryProposals("nope", 5)).toEqual([]);
    expect(parseMemoryProposals({ memories: [null, { kind: "secret", key: "a", value: "b" }, { kind: "fact", key: "", value: "b" }] }, 5)).toEqual([]);
    const many = { memories: Array.from({ length: 9 }, (_, n) => ({ kind: "fact", key: `k${n}`, value: "v", source: "inferred" })) };
    expect(parseMemoryProposals(many, 3)).toHaveLength(3);
  });
  it("uses the run's message id when one is given", () => {
    expect(goalMessageId({ id: "r", checkpoint: { source_message_id: "msg-42" } })).toBe("msg-42");
    expect(goalMessageId({ id: "r", checkpoint: {} })).toBe("run:r");
  });
});

describe("recall into the loop", () => {
  it("adds this workspace's notes to the system prompt and shows them in the feed with sources", async () => {
    const { db } = fakeDb({ business_memory: [note(), note({ id: "n2", organization_id: ORG_B, key: "Weekday hours", value: "Open 24 hours" })] });
    const { ctx, events } = makeCtx(run());
    const { deps, systems } = model({ memories: [] });
    await runAgentLoopWithMemory(ctx, deps, config(db));
    const loopSystem = systems.find((s) => s.includes("WHAT WE KNOW"))!;
    expect(loopSystem).toContain("Weekday hours: Open 9 to 5 (source: You told us this)");
    expect(loopSystem).not.toContain("24 hours");
    const recalled = events.find((e) => e.kind === "memory_recalled")!;
    expect(recalled.message).toContain("You told us this");
    expect(JSON.stringify(recalled.data)).not.toContain("org-b");
  });

  it("never recalls another workspace's notes, even when only they match", async () => {
    const { db } = fakeDb({ business_memory: [note({ organization_id: ORG_B })] });
    const { ctx, events } = makeCtx(run());
    const { deps, systems } = model({ memories: [] });
    await runAgentLoopWithMemory(ctx, deps, config(db));
    expect(systems.some((s) => s.includes("WHAT WE KNOW"))).toBe(false);
    expect(events.some((e) => e.kind === "memory_recalled")).toBe(false);
  });

  it("runs normally when memory is empty or recall breaks", async () => {
    const broken = { from: () => { throw new Error("db down"); }, rpc: async () => ({ data: null, error: null }) };
    const { ctx } = makeCtx(run());
    const { deps } = model({ memories: [] });
    await expect(runAgentLoopWithMemory(ctx, deps, config(broken))).resolves.toMatchObject({ status: "done" });
  });
});

describe("end-of-run proposals", () => {
  it("saves a model-inferred fact as proposed only, with the run as its source", async () => {
    const { db, tables } = fakeDb();
    const { ctx, events } = makeCtx(run());
    const { deps } = model({ memories: [{ kind: "fact", key: "Parking", value: "Free parking behind the shop", source: "inferred" }] });
    await runAgentLoopWithMemory(ctx, deps, config(db));
    expect(tables.business_memory).toHaveLength(1);
    expect(tables.business_memory[0]).toMatchObject({ organization_id: ORG_A, status: "proposed", source_type: "agent_inference", source_id: "run:run-1", confirmed_by: null });
    expect(events.find((e) => e.kind === "memory_proposed")!.message).toContain("1 waiting for you to confirm");
  });

  it("saves what the owner literally said as confirmed owner_message with the message id", async () => {
    const { db, tables } = fakeDb();
    const { ctx } = makeCtx(run({ checkpoint: { source_message_id: "msg-9" } }));
    const { deps } = model({ memories: [{ kind: "fact", key: "Weekday hours", value: "Open 9 to 5 on weekdays", source: "owner", quote: "We are open 9 to 5 on weekdays" }] });
    await runAgentLoopWithMemory(ctx, deps, config(db));
    expect(tables.business_memory[0]).toMatchObject({ status: "confirmed", source_type: "owner_message", source_id: "msg-9", source_quote: "We are open 9 to 5 on weekdays", confirmed_by: "u-1" });
  });

  it("a made-up owner quote is saved as an unconfirmed inference", async () => {
    const { db, tables } = fakeDb();
    const { ctx } = makeCtx(run());
    const { deps } = model({ memories: [{ kind: "fact", key: "Prices", value: "Everything is half price", source: "owner", quote: "everything is half price all year" }] });
    await runAgentLoopWithMemory(ctx, deps, config(db));
    expect(tables.business_memory[0]).toMatchObject({ status: "proposed", source_type: "agent_inference" });
  });

  it("without a signed-in owner on the run nothing is auto-confirmed", async () => {
    const { db, tables } = fakeDb();
    const { ctx } = makeCtx(run({ user_id: null }));
    const { deps } = model({ memories: [{ kind: "fact", key: "Hours", value: "9 to 5", source: "owner", quote: "open 9 to 5 on weekdays" }] });
    await runAgentLoopWithMemory(ctx, deps, config(db));
    expect(tables.business_memory[0]).toMatchObject({ status: "proposed" });
  });

  it("drops inferred tone rules and style preferences", async () => {
    const { db, tables } = fakeDb();
    const { ctx } = makeCtx(run());
    const { deps } = model({ memories: [{ kind: "tone_rule", key: "Voice", value: "Be playful", source: "inferred" }, { kind: "style_preference", key: "Look", value: "Dark", source: "url", url: "https://x.test" }] });
    await runAgentLoopWithMemory(ctx, deps, config(db));
    expect(tables.business_memory).toHaveLength(0);
  });

  it("accepts a url source only when that address appeared in the run", async () => {
    const { db, tables } = fakeDb();
    const { ctx } = makeCtx(run({ goal: "Read https://shop.example/about and update my copy" }));
    const { deps } = model({
      memories: [
        { kind: "fact", key: "Founded", value: "Since 1999", source: "url", url: "https://shop.example/about" },
        { kind: "fact", key: "Owner", value: "Pat", source: "url", url: "https://invented.example/x" },
      ],
    });
    await runAgentLoopWithMemory(ctx, deps, config(db));
    const [first, second] = tables.business_memory;
    expect(first).toMatchObject({ source_type: "url", source_id: "https://shop.example/about", status: "proposed" });
    expect(second).toMatchObject({ source_type: "agent_inference", status: "proposed" });
  });

  it("the workspace comes from the run, not the model", async () => {
    const { db, tables } = fakeDb();
    const { ctx } = makeCtx(run());
    const { deps } = model({ memories: [{ kind: "fact", key: "Hours", value: "9 to 5", source: "inferred", organization_id: ORG_B, organizationId: ORG_B }] });
    await runAgentLoopWithMemory(ctx, deps, config(db));
    expect(tables.business_memory.map((r) => r.organization_id)).toEqual([ORG_A]);
  });

  it("limits proposals per run and does not repeat a saved note", async () => {
    const { db, tables } = fakeDb({ business_memory: [note({ key: "Hours", value: "9 to 5" })] });
    const { ctx } = makeCtx(run());
    const memories = Array.from({ length: 8 }, (_, n) => ({ kind: "fact", key: n === 0 ? "Hours" : `Fact ${n}`, value: n === 0 ? "9 to 5" : `v${n}`, source: "inferred" }));
    const { deps } = model({ memories });
    await runAgentLoopWithMemory(ctx, deps, { ...config(db), maxProposals: 3 });
    expect(tables.business_memory).toHaveLength(3);
  });

  it("saves nothing when the run failed or the extra model turn breaks, and never changes the outcome", async () => {
    const failed = fakeDb();
    const a = makeCtx(run());
    const m1 = model({ memories: [{ kind: "fact", key: "k", value: "v", source: "inferred" }] }, [{ nonsense: true }]);
    const out = await runAgentLoopWithMemory(a.ctx, m1.deps, config(failed.db));
    expect(out.status).toBe("failed");
    expect(failed.tables.business_memory).toHaveLength(0);

    const broken = fakeDb();
    const b = makeCtx(run());
    const m2 = model(new Error("provider down"));
    await expect(runAgentLoopWithMemory(b.ctx, m2.deps, config(broken.db))).resolves.toMatchObject({ status: "done" });
    expect(b.events.some((e) => e.kind === "memory_step_skipped")).toBe(true);
  });
});
