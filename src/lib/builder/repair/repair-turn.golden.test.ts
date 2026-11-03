/**
 * Golden master for the batched repair turn: fixed plans, a scripted model,
 * and the exact outcome of every round written down.
 */
import { describe, expect, it, vi } from "vitest";
import { readActions } from "@/lib/site-agent";
import {
  REPAIR_MAX_MODEL_CALLS,
  applyDeterministicFixes,
  applyRepairAnswer,
  buildRepairPrompt,
  isImprovement,
  runRepairTurn,
  type RepairModelCall,
} from "./repair-turn";
import {
  actionReaderViolations,
  contentIntegrityViolations,
  editScopeViolations,
  launchQualityViolations,
  reviewFirewallViolations,
  sortViolations,
  validatePlanActions,
  violationScore,
  whitespaceViolations,
  type PlanValidationContext,
} from "./violations";
import { assessLaunchQuality } from "@/lib/builder/launch-quality-gate";

const PAGE = "7c1f2a9e-3b4d-4e8f-9a01-5d6c7b8e9f10";
const HERO = "a3e9c4d1-58b2-4f7a-9c3e-1b2d4f6a8c0e";
const FAQ = "f0b7d2e6-91c3-4a85-b7d4-6e8f0a2c4b19";
const CONTEXT = { pages: [{ id: PAGE, sections: [{ id: HERO, components: [] }, { id: FAQ, components: [] }] }] };
const KNOWN = { pageIds: new Set([PAGE]), sectionIds: new Set([HERO, FAQ]), componentIds: new Set<string>() };
const VCTX: PlanValidationContext = { known: KNOWN, scopeContext: CONTEXT, boundary: null };
const validate = (list: unknown[]) => validatePlanActions(list, VCTX);

const text = (sectionId: string, field: string, value: string) => ({ type: "set_section_text", sectionId, field, value });

const scripted = (...answers: Array<string | Error | "timeout">) => {
  const calls: string[] = [];
  const fn = vi.fn<RepairModelCall>(async ({ user, signal }) => {
    calls.push(user);
    const next = answers.shift();
    if (next === undefined) throw new Error("unexpected extra model call");
    if (next instanceof Error) throw next;
    if (next === "timeout") return new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    return { ok: true as const, text: next, costMicrocents: 1_000_000 };
  });
  return { fn, calls };
};

describe("violations: one shape for every validator", () => {
  it("action reader: refused step is P0/model; near-miss id is deterministic", () => {
    const slipped = FAQ.slice(0, 20) + FAQ.slice(21);
    const out = actionReaderViolations([text(HERO, "heading", "Fine"), { type: "no_such_action" }, text(slipped, "heading", "Ok")], KNOWN);
    expect(out.map((v) => [v.path, v.rule, v.severity, v.fixable])).toEqual([
      ["/actions/1", "action-reader.refused", "P0", "model"],
      ["/actions/2", "action-reader.near-miss-id", "P0", "deterministic"],
    ]);
  });

  it("edit scope: out-of-boundary steps are P1/model with the boundary named", () => {
    const out = editScopeViolations([text(HERO, "heading", "A"), text(FAQ, "heading", "B")], CONTEXT, { sectionIds: [HERO] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ path: "/actions/1", rule: "edit-scope.outside-boundary", severity: "P1", fixable: "model" });
    expect(out[0]!.expected).toContain(HERO);
  });

  it("content integrity and the business-facts precheck namespace", () => {
    const out = contentIntegrityViolations([
      text(HERO, "body", "Lorem ipsum dolor sit amet, consectetur adipiscing elit."),
      { type: "set_business_fact", field: "tagline", value: "Your business name here" },
    ]);
    expect(out.map((v) => [v.path, v.rule, v.fixable])).toEqual([
      ["/actions/0/value", "content-integrity.lorem_ipsum", "model"],
      ["/actions/1/value", "business-facts-precheck.placeholder_token", "model"],
    ]);
    expect(out[0]!.expected).toContain("__unfixable__");
  });

  it("whitespace is a deterministic P2", () => {
    expect(whitespaceViolations([text(HERO, "heading", "  Roof   repairs ")])).toEqual([
      expect.objectContaining({ path: "/actions/0/value", rule: "text.whitespace", severity: "P2", fixable: "deterministic" }),
    ]);
  });

  it("review firewall rejections are reported, never repairable", () => {
    expect(reviewFirewallViolations([{ index: 3, action: { type: "x" } }])[0]).toMatchObject({
      path: "/proposed/3",
      rule: "authority-firewall.review-rejected",
      fixable: "none",
    });
  });

  it("launch-quality findings become site-level hints by priority", () => {
    const report = assessLaunchQuality({ conversion: 20, messaging: 50, content: 70, mobile: 100, accessibility: 100, seo: 100, trust: 100, performance: 100, publishing: 100 });
    const out = launchQualityViolations(report);
    expect(out.find((v) => v.rule === "launch-quality-gate.conversion")).toMatchObject({ path: "/site/conversion", severity: "P0" });
    expect(out.find((v) => v.rule === "launch-quality-gate.messaging")).toMatchObject({ severity: "P1" });
  });

  it("sorts by severity and scores P0 ≫ P1 ≫ P2", () => {
    const list = sortViolations([
      { path: "/a", rule: "r", severity: "P2", expected: "", got: "", fixable: "model" },
      { path: "/b", rule: "r", severity: "P0", expected: "", got: "", fixable: "model" },
    ]);
    expect(list.map((v) => v.severity)).toEqual(["P0", "P2"]);
    expect(violationScore(list)).toBe(101);
  });
});

describe("round 0: deterministic fixes, zero tokens", () => {
  it("repairs a near-miss id and whitespace without calling the model", async () => {
    const slipped = FAQ.slice(0, 20) + FAQ.slice(21);
    const { fn } = scripted();
    const out = await runRepairTurn({ actions: [text(slipped, "heading", "  Questions   we hear "), text(HERO, "heading", "Roofs")], validate, known: KNOWN, callModel: fn });
    expect(fn).not.toHaveBeenCalled();
    expect(out.actions).toEqual([text(FAQ, "heading", "Questions we hear"), text(HERO, "heading", "Roofs")]);
    expect(out).toMatchObject({ after: [], modelCalls: 0, stopped: "clean" });
    expect(out.deterministicFixes).toBeGreaterThanOrEqual(2);
    expect(readActions(out.actions, KNOWN)).toHaveLength(2);
  });

  it("applyDeterministicFixes ignores model-fixable violations", () => {
    const actions = [text(HERO, "body", "Lorem ipsum dolor sit amet")];
    expect(applyDeterministicFixes(actions, validate(actions), KNOWN)).toEqual({ actions, fixed: 0 });
  });
});

describe("rounds 1–2: one batched call carrying every failure", () => {
  const plan = () => [
    text(HERO, "heading", "Roof repairs done right"),
    text(HERO, "body", "Lorem ipsum dolor sit amet, consectetur adipiscing elit."),
    { type: "set_section_text", sectionId: FAQ, field: "heading" },
  ];

  it("round 1 fixes all violations in ONE call (replacement + search/replace edit)", async () => {
    const { fn, calls } = scripted(
      JSON.stringify({
        "/actions/2": text(FAQ, "heading", "Questions homeowners ask"),
        __edits__: [{ path: "/actions/1/value", search: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.", replace: "We fix leaks the same week." }],
      }),
    );
    const out = await runRepairTurn({ actions: plan(), validate, known: KNOWN, callModel: fn });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(calls[0]).toContain("VIOLATIONS (2 total, ordered by severity):");
    expect(calls[0]).toContain("path: /actions/1/value");
    expect(calls[0]).toContain("path: /actions/2");
    expect(out.actions).toEqual([text(HERO, "heading", "Roof repairs done right"), text(HERO, "body", "We fix leaks the same week."), text(FAQ, "heading", "Questions homeowners ask")]);
    expect(out).toMatchObject({ after: [], modelCalls: 1, stopped: "clean", costMicrocents: 1_000_000 });
  });

  it("round 2 restates what failed; never a third call", async () => {
    const { fn, calls } = scripted("not json at all", JSON.stringify({ "/actions/2": { type: "still_wrong" } }));
    const out = await runRepairTurn({ actions: plan(), validate, known: KNOWN, callModel: fn });
    expect(fn).toHaveBeenCalledTimes(REPAIR_MAX_MODEL_CALLS);
    expect(calls[1]).toContain("THESE WERE ATTEMPTED AND FAILED");
    expect(out.actions).toEqual(plan());
    expect(out.stopped).toBe("no_improvement");
  });

  it("__unfixable__ is honoured: that path is not retried", async () => {
    const { fn } = scripted(JSON.stringify({ "/actions/2": text(FAQ, "heading", "FAQ"), __unfixable__: ["/actions/1/value"] }));
    const out = await runRepairTurn({ actions: plan(), validate, known: KNOWN, callModel: fn });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(out.unfixable).toEqual(["/actions/1/value"]);
    expect(out.after.map((v) => v.rule)).toEqual(["content-integrity.lorem_ipsum"]);
    expect(out.stopped).toBe("nothing_model_fixable");
  });

  it("a repair that touches a clean step is refused whole", async () => {
    const { fn } = scripted(
      JSON.stringify({ "/actions/2": text(FAQ, "heading", "FAQ"), "/actions/0": text(HERO, "heading", "Hijacked") }),
      JSON.stringify({}),
    );
    const out = await runRepairTurn({ actions: plan(), validate, known: KNOWN, callModel: fn });
    // /actions/0 is not a violation path, so that key is ignored; the rest applies.
    expect((out.actions[0] as { value: string }).value).toBe("Roof repairs done right");
    expect(out.actions[2]).toEqual(text(FAQ, "heading", "FAQ"));
  });

  it("a repair that makes things worse is not accepted", () => {
    const before = plan();
    const worse = [...before];
    worse[2] = text(FAQ, "heading", "Lorem ipsum dolor sit amet");
    expect(isImprovement({ actions: before, violations: validate(before) }, { actions: worse, violations: validate(worse) })).toBe(false);
  });

  it("fuzzy search below 0.8 is not applied", () => {
    const actions = plan();
    const out = applyRepairAnswer(actions, JSON.stringify({ __edits__: [{ path: "/actions/1/value", search: "totally unrelated words here", replace: "x" }] }), validate(actions));
    expect(out.applied).toBe(0);
    expect(out.actions).toBe(actions);
    expect(out.ignored[0]).toMatch(/none anchor/);
  });

  it("an edit outside every violation path is ignored", () => {
    const actions = plan();
    const out = applyRepairAnswer(actions, JSON.stringify({ __edits__: [{ path: "/actions/0/value", search: "Roof", replace: "Hacked" }] }), validate(actions));
    expect(out.applied).toBe(0);
  });
});

describe("hard limits: timeout, budget, failures fail open", () => {
  const plan = [text(HERO, "body", "Lorem ipsum dolor sit amet, consectetur adipiscing elit.")];

  it("a hung model call is aborted at the per-call timeout and the plan is unchanged", async () => {
    const { fn } = scripted("timeout");
    const out = await runRepairTurn({ actions: plan, validate, known: KNOWN, callModel: fn, budget: { callTimeoutMs: 20, totalTimeoutMs: 5_000 } });
    expect(out).toMatchObject({ actions: plan, stopped: "timeout", modelCalls: 1 });
  });

  it("no call is made when the total time budget is already spent", async () => {
    const { fn } = scripted();
    let t = 0;
    const out = await runRepairTurn({ actions: plan, validate, known: KNOWN, callModel: fn, budget: { totalTimeoutMs: 500 }, now: () => (t += 1_000) });
    expect(fn).not.toHaveBeenCalled();
    expect(out.stopped).toBe("timeout");
  });

  it("stops before the second call once the spend budget is used", async () => {
    const { fn } = scripted("{}");
    const out = await runRepairTurn({ actions: plan, validate, known: KNOWN, callModel: fn, budget: { maxCostMicrocents: 500_000 } });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(out.stopped).toBe("budget");
  });

  it("stops at the call cap when the last call improved but left violations", async () => {
    const twoProblems = [text(HERO, "body", "Lorem ipsum dolor sit amet, consectetur adipiscing elit."), { type: "set_section_text", sectionId: FAQ, field: "heading" }];
    const { fn } = scripted(JSON.stringify({ "/actions/1": text(FAQ, "heading", "Questions homeowners ask") }));
    const out = await runRepairTurn({ actions: twoProblems, validate, known: KNOWN, callModel: fn, budget: { maxCalls: 1 } });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(out.actions[1]).toEqual(text(FAQ, "heading", "Questions homeowners ask"));
    expect(out.after.map((v) => v.rule)).toEqual(["content-integrity.lorem_ipsum"]);
    expect(out.stopped).toBe("max_calls");
  });

  it("a throwing model fails open", async () => {
    const { fn } = scripted(new Error("provider down"));
    const out = await runRepairTurn({ actions: plan, validate, known: KNOWN, callModel: fn });
    expect(out).toMatchObject({ actions: plan, stopped: "model_unavailable" });
  });

  it("cannot be configured above two model calls", async () => {
    const { fn } = scripted("{}", "{}");
    await runRepairTurn({ actions: plan, validate, known: KNOWN, callModel: fn, budget: { maxCalls: 9 } });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("prompt contract", () => {
  it("orders by severity, keys fragments by path, and states the output contract", () => {
    const actions = [text(HERO, "heading", "  spaced  "), { type: "set_section_text", sectionId: FAQ, field: "heading" }];
    const prompt = buildRepairPrompt(actions, validate(actions));
    expect(prompt.indexOf("severity: P0")).toBeLessThan(prompt.indexOf("severity: P2"));
    expect(prompt).toContain('"/actions/1"');
    expect(prompt).toContain("__unfixable__");
    expect(prompt).toContain("Never invent facts");
  });
});
