import { describe, expect, it } from "vitest";
import { mergeRepairEvents, repairCard, repairEventFrom, type RepairEvent } from "./repair-card";
import { hydrateTasks } from "./hydrate-tasks";

const overflow = "Page overflows sideways at 320 px (services grid)";
const fixedEvent: RepairEvent = {
  checked: true,
  before: { score: 82, findings: 1, notes: [overflow] },
  after: { score: 100, findings: 0, notes: [] },
  repaired: [overflow],
  unresolved: [],
  failed: [],
  reported: [],
};

describe("repair card (B12-1)", () => {
  it("no event, no card", () => {
    expect(repairCard(null)).toBeNull();
    expect(repairCard(undefined)).toBeNull();
    // A clean check (nothing tried) is not an event.
    expect(repairCard({ ...fixedEvent, repaired: [] })).toBeNull();
    // Checks that could not run are not an event either: nothing was found or fixed.
    expect(repairEventFrom({ ...fixedEvent, checked: false })).toBeNull();
    expect(repairEventFrom("nope")).toBeNull();
    expect(repairEventFrom([fixedEvent])).toBeNull();
  });

  it("a stubbed overflow-at-320 then fix shows found / fixed / verified", () => {
    const card = repairCard(fixedEvent)!;
    expect(card.verdict).toBe("verified");
    expect(card.found).toEqual([overflow]);
    expect(card.fixed).toEqual([overflow]);
    expect(card.findingsBefore).toBe(1);
    expect(card.findingsAfter).toBe(0);
    expect(card.offerRestore).toBe(false);
  });

  it("a failed re-check says so and offers restore", () => {
    const card = repairCard({
      ...fixedEvent,
      repaired: [],
      unresolved: [overflow],
      after: { score: 82, findings: 1, notes: [overflow] },
    })!;
    expect(card.verdict).toBe("recheck_failed");
    expect(card.stillThere).toEqual([overflow]);
    expect(card.offerRestore).toBe(true);
    const refused = repairCard({
      ...fixedEvent,
      repaired: [],
      failed: ["Missing page title on About"],
    })!;
    expect(refused.verdict).toBe("recheck_failed");
    expect(refused.notApplied).toEqual(["Missing page title on About"]);
  });

  it("never carries extra fields such as model reasoning, and bounds every line", () => {
    const event = repairEventFrom({
      ...fixedEvent,
      reasoning: "secret chain of thought",
      repaired: [overflow, 42, "x".repeat(500)],
    })!;
    expect(JSON.stringify(event)).not.toContain("chain of thought");
    expect(event.repaired).toHaveLength(2);
    expect(event.repaired[1]!.length).toBeLessThanOrEqual(200);
    const many = repairEventFrom({
      ...fixedEvent,
      repaired: Array.from({ length: 30 }, (_, i) => `fix ${i}`),
    })!;
    expect(many.repaired).toHaveLength(8);
  });

  it("merges batches: first check is before, last is after, all outcomes kept", () => {
    const second: RepairEvent = {
      ...fixedEvent,
      before: { score: 90, findings: 1, notes: ["b"] },
      after: { score: 95, findings: 1, notes: ["c"] },
      repaired: [],
      unresolved: ["c"],
    };
    const merged = mergeRepairEvents([fixedEvent, null, second])!;
    expect(merged.before.notes).toEqual([overflow]);
    expect(merged.after.findings).toBe(1);
    expect(merged.repaired).toEqual([overflow]);
    expect(merged.unresolved).toEqual(["c"]);
    expect(mergeRepairEvents([null, undefined])).toBeNull();
  });

  it("comes back after a reload from the saved result", () => {
    const [task] = hydrateTasks([
      {
        instruction: "Fix the phone layout",
        reply: "1 change applied.",
        at: "2026-11-04T00:00:00Z",
        taskResult: { state: "complete", applied: 1, repair: fixedEvent },
      },
    ]);
    expect(task!.repair?.repaired).toEqual([overflow]);
    const [plain] = hydrateTasks([
      {
        instruction: "x",
        reply: "ok",
        at: "2026-11-04T00:00:00Z",
        taskResult: { state: "complete", applied: 1 },
      },
    ]);
    expect(plain!.repair).toBeUndefined();
  });
});
