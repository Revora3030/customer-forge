import { describe, expect, it } from "vitest";
import { canAutoContinueAfterVerification } from "@/lib/builder/autonomous-loop";

describe("autonomous loop continuation", () => {
  it("continues only for safe low-scoring first passes", () => {
    expect(canAutoContinueAfterVerification({ score: 80, iteration: 0 })).toBe(true);
    expect(canAutoContinueAfterVerification({ score: 94, iteration: 1 })).toBe(true);
  });

  it("stops at the bounded iteration limit", () => {
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
});
