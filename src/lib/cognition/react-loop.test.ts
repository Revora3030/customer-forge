import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { FINAL_ROUND_NOTE, nextRoundIsFinal, reflectOnRound, runReActLoop, type LoopAction } from "./react-loop";

const script = (actions: LoopAction[]) => {
  let i = 0;
  return async () => actions[Math.min(i++, actions.length - 1)]!;
};

describe("runReActLoop", () => {
  it("runs a tool, feeds the observation back and returns the final answer", async () => {
    const seen: number[] = [];
    const result = await runReActLoop({
      think: async (trace) => {
        seen.push(trace.length);
        return trace.length === 0 ? { type: "tool", tool: "measure", input: { px: 390 } } : { type: "final", answer: "overflow at 390" };
      },
      tools: { measure: async (input) => `measured ${JSON.stringify(input)}` },
    });
    expect(result.status).toBe("answered");
    expect(seen).toEqual([0, 2]);
  });

  it("reflects on a tool error and recovers on the next turn", async () => {
    let calls = 0;
    const result = await runReActLoop({
      think: async (trace) => (trace.some((s) => s.kind === "reflection") ? { type: "final", answer: "changed approach" } : { type: "tool", tool: "flaky", input: null }),
      tools: { flaky: async () => { calls += 1; throw new Error("selector not found"); } },
    });
    expect(calls).toBe(1);
    expect(result.status).toBe("answered");
    expect(result.trace.find((s) => s.kind === "reflection")).toMatchObject({ note: expect.stringContaining("selector not found") });
  });

  it("gives up after repeated consecutive tool errors", async () => {
    const result = await runReActLoop({
      think: script([{ type: "tool", tool: "bad", input: null }]),
      tools: { bad: async () => { throw new Error("nope"); } },
      limits: { maxConsecutiveErrors: 2 },
    });
    expect(result).toMatchObject({ status: "stopped", reason: "repeated_errors" });
  });

  it("stops at the step limit, on abort, and on repeated unknown tools; truncates observations", async () => {
    expect(await runReActLoop({ think: script([{ type: "tool", tool: "ok", input: null }]), tools: { ok: async () => "x".repeat(5000) }, limits: { maxSteps: 3, maxObservationChars: 10 } }))
      .toMatchObject({ status: "stopped", reason: "max_steps" });
    const long = await runReActLoop({ think: script([{ type: "tool", tool: "ok", input: null }, { type: "final", answer: "done" }]), tools: { ok: async () => "x".repeat(5000) }, limits: { maxObservationChars: 10 } });
    expect(long.trace.find((s) => s.kind === "observation")).toMatchObject({ output: "x".repeat(10) });
    const controller = new AbortController();
    controller.abort();
    expect(await runReActLoop({ think: script([{ type: "final", answer: "x" }]), tools: {}, signal: controller.signal })).toMatchObject({ reason: "aborted" });
    expect(await runReActLoop({ think: script([{ type: "tool", tool: "ghost", input: null }]), tools: {} })).toMatchObject({ reason: "unknown_tool_limit" });
  });

  it("does not let a model reach inherited object keys as tools", async () => {
    const result = await runReActLoop({ think: script([{ type: "tool", tool: "constructor", input: null }]), tools: {} });
    expect(result).toMatchObject({ status: "stopped", reason: "unknown_tool_limit" });
  });
});

describe("reflectOnRound", () => {
  const ok = { label: "a", ok: true, result: "x" };
  const bad = { label: "b", ok: false, result: "boom" };
  it("says nothing when every tool worked and resets the streak", () => {
    expect(reflectOnRound([ok], 1)).toEqual({ note: null, failedRounds: 0, giveUp: false });
  });
  it("sends a partial failure back with an instruction to change approach", () => {
    const r = reflectOnRound([ok, bad], 0);
    expect(r.note).toContain("Failed: b");
    expect(r).toMatchObject({ failedRounds: 0, giveUp: false });
  });
  it("gives up after a second all-failed round in a row", () => {
    const first = reflectOnRound([bad], 0);
    expect(first).toMatchObject({ failedRounds: 1, giveUp: false });
    const second = reflectOnRound([bad], first.failedRounds);
    expect(second.giveUp).toBe(true);
    expect(second.note).toContain("Stop calling tools");
  });
});

describe("the last lookup round always ends in an answer", () => {
  it("marks the round after the second-to-last step, or after giving up, as the final one", () => {
    // Jarvis runs steps 0..3; step 3 runs no actions.
    expect([0, 1, 2].map((step) => nextRoundIsFinal(step, 3, false))).toEqual([false, false, true]);
    expect(nextRoundIsFinal(0, 3, true)).toBe(true);
  });

  it("tells the model plainly to answer now and not to ask for more lookups", () => {
    expect(FINAL_ROUND_NOTE).toMatch(/last turn/);
    expect(FINAL_ROUND_NOTE).toMatch(/do not ask for any/);
  });

  it("still lets it propose a change for approval, which the last round collects", () => {
    expect(FINAL_ROUND_NOTE).toMatch(/change to propose for the owner's approval/);
    expect(FINAL_ROUND_NOTE).not.toMatch(/Do not request actions/);
  });

  it("is sent to Jarvis with the results before its last round", () => {
    const source = readFileSync("src/lib/jarvis.functions.ts", "utf8");
    expect(source).toContain("...(nextRoundIsFinal(step, MAX_ACTION_STEPS, reflection.giveUp) ? [FINAL_ROUND_NOTE] : []),");
  });
});
