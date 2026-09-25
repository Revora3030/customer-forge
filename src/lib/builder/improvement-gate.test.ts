import { describe, expect, it } from "vitest";
import { decide, runImprovementGate, type GateBlocker } from "./improvement-gate.server";
import { parseNote, runReviewPanel } from "./review-panel.server";

const validTree = {
  version: 1,
  root: { type: "stack", children: [{ type: "heading", text: "Only supplied words", level: 2 }] },
};

describe("improvement gate", () => {
  it("accepts any valid AI revision without scoring taste", () => {
    expect(decide([]).accepted).toBe(true);
  });

  it("rejects only non-creative safety blockers", () => {
    const blockers: GateBlocker[] = [{ area: "renderer", path: "hero.root", issue: "unsupported primitive" }];
    const decision = decide(blockers);
    expect(decision.accepted).toBe(false);
    expect(decision.reason).toMatch(/renderer safeguard/);
  });

  it("accepts valid proposed composition trees without calling a reviewer model", async () => {
    const report = await runImprovementGate({ organizationId: "o", context: "", current: {}, proposed: { hero: validTree } });
    expect(report.accepted).toBe(true);
    expect(report.model).toBeNull();
    expect(report.costMicrocents).toBe(0);
  });

  it("rejects invalid proposed composition trees", async () => {
    const report = await runImprovementGate({ organizationId: "o", context: "", current: {}, proposed: { hero: { version: 1, root: { type: "script" } } } });
    expect(report.accepted).toBe(false);
    expect(report.blocked[0]?.area).toBe("renderer");
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
    expect(out.failed.length).toBe(5);
  });
});
