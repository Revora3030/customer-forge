import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RevoraAiError } from "@/lib/ai/errors";
import { executiveFallback } from "./jarvis-executive-fallback";
import { jarvisModelRequest } from "./jarvis-model-request.server";
import {
  createTurnDeadline,
  JARVIS_ATTEMPT_TIMEOUT_MS,
  JARVIS_CHAIN_DEADLINE_MS,
  MIN_ROUND_MS,
  TURN_DEADLINE_MESSAGE,
  VISITOR_JARVIS_ATTEMPT_TIMEOUT_MS,
  VISITOR_JARVIS_CHAIN_DEADLINE_MS,
} from "./jarvis-turn-deadline";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A fake model that answers only after `ms`, like a slow failover chain. */
function slowModel(ms: number) {
  return vi.fn((request: { timeoutMs?: number; chainDeadlineMs?: number }) =>
    new Promise<{ text: string; request: typeof request }>((resolve) => setTimeout(() => resolve({ text: "answer", request }), ms)));
}

/**
 * The same shape as runJarvis's loop: every round (including a correction round)
 * asks the deadline for its budget and races the model against what is left.
 */
async function runRounds(rounds: number, model: ReturnType<typeof slowModel>, totalMs: number) {
  const deadline = createTurnDeadline(totalMs);
  const answers: string[] = [];
  try {
    for (let step = 0; step < rounds; step += 1) {
      const result = await deadline.race(model(jarvisModelRequest([{ role: "user", content: "hi" }], 800, null, deadline.nextRound())));
      answers.push(result.text);
    }
    return { answers, reply: answers.join(" ") };
  } catch (error) {
    return { answers, reply: executiveFallback({ ran: [], reason: error instanceof Error ? error.message : "", error }), error };
  }
}

describe("Jarvis turn deadline", () => {
  it("stops a turn whose model rounds outrun the limit and answers with the timeout fallback", async () => {
    const model = slowModel(40_000);
    const run = runRounds(5, model, 100_000);
    await vi.advanceTimersByTimeAsync(200_000);
    const { answers, reply, error } = await run;
    expect(answers).toHaveLength(2);
    expect(model).toHaveBeenCalledTimes(3);
    expect(error).toBeInstanceOf(RevoraAiError);
    expect((error as RevoraAiError).category).toBe("timeout");
    expect(reply).toContain(TURN_DEADLINE_MESSAGE);
    expect(reply).toContain("Revora AI took too long to answer. Try again");
  });

  it("drops a single model call that never finishes", async () => {
    const model = slowModel(10 * 60_000);
    const run = runRounds(1, model, 110_000);
    await vi.advanceTimersByTimeAsync(110_000);
    const { error } = await run;
    expect((error as RevoraAiError).category).toBe("timeout");
  });

  it("does not start a round with less than the minimum left", async () => {
    const model = slowModel(1);
    const deadline = createTurnDeadline(MIN_ROUND_MS + 1_000);
    expect(deadline.nextRound()).toEqual({ timeoutMs: MIN_ROUND_MS + 1_000, chainDeadlineMs: MIN_ROUND_MS + 1_000 });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(() => deadline.nextRound()).toThrow(TURN_DEADLINE_MESSAGE);
    expect(model).not.toHaveBeenCalled();
  });

  it("caps each round's model budget by the time left", async () => {
    const deadline = createTurnDeadline(110_000);
    expect(deadline.nextRound()).toEqual({ timeoutMs: JARVIS_ATTEMPT_TIMEOUT_MS, chainDeadlineMs: JARVIS_CHAIN_DEADLINE_MS });
    await vi.advanceTimersByTimeAsync(80_000);
    expect(deadline.nextRound()).toEqual({ timeoutMs: 30_000, chainDeadlineMs: 30_000 });
  });

  it("lets a fast turn finish normally", async () => {
    const model = slowModel(2_000);
    const run = runRounds(3, model, 110_000);
    await vi.advanceTimersByTimeAsync(10_000);
    const { answers, error } = await run;
    expect(error).toBeUndefined();
    expect(answers).toEqual(["answer", "answer", "answer"]);
  });

  it("is wired into every runJarvis model round and tool round", () => {
    const source = readFileSync("src/lib/jarvis.functions.ts", "utf8");
    expect(source).toContain("const deadline = createTurnDeadline();");
    expect(source).toContain("jarvisModelRequest(conversation, MODE_CONFIG[mode].tokens, pickedModel, deadline.nextRound())");
    expect(source).toContain("await deadline.race(runReadActions(");
  });

  it("gives the public visitor chat a shorter limit than admin Jarvis", () => {
    expect(VISITOR_JARVIS_ATTEMPT_TIMEOUT_MS).toBeLessThan(JARVIS_ATTEMPT_TIMEOUT_MS);
    expect(VISITOR_JARVIS_CHAIN_DEADLINE_MS).toBeLessThan(JARVIS_CHAIN_DEADLINE_MS);
    const source = readFileSync("src/lib/visitor-jarvis.functions.ts", "utf8");
    expect(source).toContain("timeoutMs: VISITOR_JARVIS_ATTEMPT_TIMEOUT_MS,");
    expect(source).toContain("chainDeadlineMs: VISITOR_JARVIS_CHAIN_DEADLINE_MS,");
  });
});
