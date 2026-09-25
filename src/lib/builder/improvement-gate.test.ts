import { describe, expect, it } from "vitest";
import { decide, runImprovementGate, GATE_AREAS, type GateScores } from "./improvement-gate.server";
import { parseNote, runReviewPanel } from "./review-panel.server";

const scores = (v: number, over: Partial<GateScores> = {}) =>
  ({ ...Object.fromEntries(GATE_AREAS.map((a) => [a, v])), ...over }) as GateScores;

describe("improvement gate", () => {
  it("accepts a higher-scoring revision", () => {
    expect(decide(scores(6), scores(8)).accepted).toBe(true);
  });
  it("rejects a lower-scoring revision", () => {
    expect(decide(scores(8), scores(6)).accepted).toBe(false);
  });
  it("rejects a revision that drops a protected area even when the total rises", () => {
    expect(decide(scores(6), scores(9, { mobile: 5 })).accepted).toBe(false);
  });
  it("keeps the current version when the reviewer fails", async () => {
    const thinker = (async () => ({ ok: false, reason: "down" })) as never;
    const report = await runImprovementGate({ organizationId: "o", context: "", current: {}, proposed: {} }, thinker);
    expect(report.accepted).toBe(false);
  });
});

describe("review panel", () => {
  it("parses reviewer notes", () => {
    expect(parseNote('{"issues":["fix a"],"severity":"high"}', "seo", "m")?.issues).toEqual(["fix a"]);
  });
  it("survives every reviewer failing", async () => {
    const thinker = (async () => { throw new Error("x"); }) as never;
    const out = await runReviewPanel({ organizationId: "o", material: "", mode: "light" }, thinker);
    expect(out.notes).toEqual([]);
    expect(out.failed.length).toBe(4);
  });
});
