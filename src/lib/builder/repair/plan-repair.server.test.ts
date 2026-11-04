/**
 * The repair turn inside edit planning: model repairs must pass the fact
 * review again, a missing review discards them, and every failure fails open.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const thinker = vi.hoisted(() => ({ callBestThinker: vi.fn() }));
vi.mock("@/lib/ai/thinker.server", () => thinker);

import { repairPlanActions } from "./plan-repair.server";

const PAGE = "7c1f2a9e-3b4d-4e8f-9a01-5d6c7b8e9f10";
const HERO = "a3e9c4d1-58b2-4f7a-9c3e-1b2d4f6a8c0e";
const FAQ = "f0b7d2e6-91c3-4a85-b7d4-6e8f0a2c4b19";
const context = { pages: [{ id: PAGE, slug: "/", sections: [{ id: HERO, components: [] }, { id: FAQ, components: [] }] }] } as never;
const text = (sectionId: string, field: string, value: string) => ({ type: "set_section_text", sectionId, field, value });
const LOREM = "Lorem ipsum dolor sit amet, consectetur adipiscing elit.";

const base = (review: (list: unknown[]) => Promise<Record<string, unknown> | null>) => ({
  context,
  boundary: null,
  system: "SYSTEM PREFIX",
  instruction: "tidy the hero",
  organizationId: "org-1",
  review,
});

beforeEach(() => thinker.callBestThinker.mockReset());

describe("repairPlanActions", () => {
  it("leaves a clean plan alone without any model call", async () => {
    const actions = [text(HERO, "heading", "Roof repairs done right")];
    const review = vi.fn();
    const out = await repairPlanActions({ actions, ...base(review) });
    expect(out.actions).toBe(actions);
    expect(thinker.callBestThinker).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
  });

  it("keeps a model repair the review accepts, using the planner's cached system prefix", async () => {
    thinker.callBestThinker.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({ __edits__: [{ path: "/actions/0/value", search: LOREM, replace: "We fix leaks the same week." }] }),
      costMicrocents: 2_000,
    });
    const review = vi.fn(async () => ({ reject: [], notes: [] }));
    const out = await repairPlanActions({ actions: [text(HERO, "body", LOREM)], ...base(review) });
    expect(thinker.callBestThinker).toHaveBeenCalledTimes(1);
    expect(thinker.callBestThinker.mock.calls[0]![0]).toMatchObject({ system: "SYSTEM PREFIX", complexity: "medium", json: true });
    expect(review).toHaveBeenCalledTimes(1);
    expect(out.actions).toEqual([text(HERO, "body", "We fix leaks the same week.")]);
    expect(out.costMicrocents).toBe(2_000);
    expect(out.note).toMatch(/fixed automatically/);
  });

  it("reverts a repaired step the review rejects", async () => {
    thinker.callBestThinker.mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify({ "/actions/0/value": "Licensed since 1987 with 4,000 five-star reviews." }),
      costMicrocents: 1,
    });
    const actions = [text(HERO, "body", LOREM)];
    const out = await repairPlanActions({ actions, ...base(async () => ({ reject: [0] })) });
    expect(out.actions).toEqual(actions);
  });

  it("discards model repairs when the review cannot run", async () => {
    thinker.callBestThinker.mockResolvedValueOnce({ ok: true, text: JSON.stringify({ "/actions/0/value": "Real words." }), costMicrocents: 1 });
    const actions = [text(HERO, "body", LOREM)];
    const out = await repairPlanActions({ actions, ...base(async () => null) });
    expect(out.actions).toEqual(actions);
    expect(out.log).toContain("review unavailable: model repairs discarded");
  });

  it("keeps deterministic fixes even when the model and review are unavailable", async () => {
    thinker.callBestThinker.mockResolvedValue({ ok: false, reason: "free_only" });
    const out = await repairPlanActions({ actions: [text(HERO, "heading", "  Roof   repairs ")], ...base(async () => null) });
    expect(out.actions).toEqual([text(HERO, "heading", "Roof repairs")]);
    expect(thinker.callBestThinker).not.toHaveBeenCalled();
  });

  it("does not repair into a scope that matches none of the plan (scope fail-open)", async () => {
    const actions = [text(FAQ, "heading", "Questions")];
    const out = await repairPlanActions({ actions, ...base(vi.fn()), boundary: { sectionIds: [HERO] } });
    expect(out.actions).toBe(actions);
    expect(thinker.callBestThinker).not.toHaveBeenCalled();
  });

  it("fails open on any unexpected error", async () => {
    thinker.callBestThinker.mockResolvedValueOnce({ ok: true, text: JSON.stringify({ "/actions/0/value": "Fine words." }), costMicrocents: 1 });
    const actions = [text(HERO, "body", LOREM)];
    const out = await repairPlanActions({ actions, ...base(async () => { throw new Error("boom"); }) });
    expect(out.actions).toBe(actions);
  });
});

describe("planner wiring (source order)", () => {
  const src = readFileSync("src/lib/builder/ai-agent-plan.server.ts", "utf8");
  it("runs the repair turn after review and polish, before scope enforcement and the action reader", () => {
    const review = src.indexOf("applyReview(proposedActions");
    const polish = src.indexOf("THESE LAYOUTS FROM YOUR PLAN MISS THE DESIGN BAR");
    const repair = src.indexOf("repairPlanActions({");
    const scope = src.indexOf("applyEditScope(actions, context, boundary)");
    const reader = src.indexOf("parseActions(actions,");
    expect(review).toBeGreaterThan(0);
    expect(polish).toBeGreaterThan(review);
    expect(repair).toBeGreaterThan(polish);
    expect(scope).toBeGreaterThan(repair);
    expect(reader).toBeGreaterThan(scope);
  });
  it("re-reviews repaired steps with the same truth rules", () => {
    const block = src.slice(src.indexOf("repairPlanActions({"), src.indexOf("applyEditScope(actions, context, boundary)"));
    expect(block).toContain('purpose: "adversarial_review"');
    expect(block).toContain("TRUTH_RULES");
  });
});
