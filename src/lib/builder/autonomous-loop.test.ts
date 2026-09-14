import { describe, expect, it } from "vitest";
import {
  buildRepairInstruction,
  canAutoContinueAfterVerification,
} from "@/lib/builder/autonomous-loop";

describe("autonomous loop continuation", () => {
  it("continues only for safe low-scoring passes", () => {
    expect(canAutoContinueAfterVerification({ score: 80, iteration: 0 })).toBe(true);
    expect(canAutoContinueAfterVerification({ score: 94, iteration: 1 })).toBe(true);
  });

  it("stops at the bounded repair-pass limit", () => {
    expect(canAutoContinueAfterVerification({ score: 94, iteration: 2 })).toBe(false);
  });

  it("never silently continues a high-impact change", () => {
    expect(
      canAutoContinueAfterVerification({
        score: 70,
        iteration: 0,
        hasHighImpactChange: true,
      }),
    ).toBe(false);
  });

  it("stops when the quality target is reached", () => {
    expect(canAutoContinueAfterVerification({ score: 95, iteration: 0 })).toBe(false);
  });

  it("stops when a pass does not improve quality", () => {
    expect(
      canAutoContinueAfterVerification({ score: 82, previousScore: 82, iteration: 0 }),
    ).toBe(false);
  });

  it("builds a bounded repair instruction without exposing internal implementation details", () => {
    const instruction = buildRepairInstruction("Make my site better", "The Services page has no browser title.");
    expect(instruction).toContain("Make my site better");
    expect(instruction).toContain("The Services page has no browser title.");
    expect(instruction).toContain("verified business facts");
  });
});
