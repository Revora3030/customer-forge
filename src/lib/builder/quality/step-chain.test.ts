import { describe, expect, it } from "vitest";
import { CHAIN_ORDER, parseReview, runStepChain, stepPrompt, type StepCall } from "@/lib/builder/quality/step-chain";

const inputs = { blueprintBlock: "BLUEPRINT-FIRST x", factsBlock: "FACTS y", goldBlock: "GOLD z", request: "make it bold" };

describe("step chain", () => {
  it("runs the four steps in order with the routed roles", async () => {
    const calls: StepCall[] = [];
    const out = await runStepChain(inputs, async (c) => { calls.push(c); return c.step === "review" ? '{"passed":true,"issues":[]}' : `${c.step} output`; }, { env: {} });
    expect(out.ok).toBe(true);
    expect(calls.map((c) => c.step)).toEqual([...CHAIN_ORDER]);
    expect(calls.map((c) => c.role)).toEqual(["design", "primary", "design", "fast"]);
    expect(out.results.review?.passed).toBe(true);
  });

  it("feeds each step only what it needs", () => {
    expect(stepPrompt("plan", inputs, {}).prompt).not.toContain("GOLD z");
    expect(stepPrompt("copy", inputs, { plan: "P" }).prompt).not.toContain("BLUEPRINT-FIRST");
    const layout = stepPrompt("layout", inputs, { plan: "P", copy: "C" }).prompt;
    expect(layout).toContain("GOLD z");
    expect(layout).toContain("C");
  });

  it("states the no-invented-facts rule in every step", () => {
    for (const s of CHAIN_ORDER.filter((x) => x !== "review")) expect(stepPrompt(s, inputs, {}).system).toMatch(/Never invent/);
  });

  it("stops at the first failed step and never runs later ones", async () => {
    const ran: string[] = [];
    const out = await runStepChain(inputs, async (c) => { ran.push(c.step); if (c.step === "copy") throw new Error("boom"); return "ok"; }, { env: {} });
    expect(out.ok).toBe(false);
    expect(out.failedStep).toBe("copy");
    expect(ran).toEqual(["plan", "copy"]);
    expect(out.trace[1]).toMatchObject({ ok: false, error: "boom" });
  });

  it("treats an empty answer as a failure", async () => {
    const out = await runStepChain(inputs, async () => "  ", { env: {} });
    expect(out.failedStep).toBe("plan");
  });

  it("never reads an unreadable review as a pass", () => {
    expect(parseReview("looks fine").passed).toBe(false);
    expect(parseReview("{not json}").passed).toBe(false);
    expect(parseReview('{"passed":true,"issues":[{"part":"hero","problem":"invented rating"}]}').passed).toBe(false);
    expect(parseReview('Here: {"passed":true,"issues":[]}').passed).toBe(true);
  });
});
