import { describe, expect, it } from "vitest";
import { GROWTH_SYSTEM } from "@/lib/offer";
import { MAX_TOOL_PRICE, SAVINGS_TOOLS, cleanPrice, computeSavings, typicalComparison } from "./software-savings";

describe("computeSavings", () => {
  it("shows nothing when no tool is entered", () => {
    const r = computeSavings({});
    expect(r.toolCount).toBe(0);
    expect(r.currentMonthly).toBe(0);
    expect(r.revoraCostsMore).toBe(false);
  });

  it("compares against the canonical offer: setup once, first month free", () => {
    const r = computeSavings({ website: 39, scheduling: 30, forms: 50, email: 60, reviews: 99 });
    expect(r.currentMonthly).toBe(278);
    expect(r.revoraMonthly).toBe(GROWTH_SYSTEM.monthlyPrice);
    expect(r.monthlyDifference).toBe(278 - GROWTH_SYSTEM.monthlyPrice);
    expect(r.firstYearRevora).toBe(GROWTH_SYSTEM.setupPrice + GROWTH_SYSTEM.monthlyPrice * 11);
    expect(r.firstYearCurrent).toBe(278 * 12);
    expect(r.firstYearDifference).toBe(278 * 12 - r.firstYearRevora);
  });

  it("says so when the tools cost less than Revora instead of inflating a saving", () => {
    const r = computeSavings({ scheduling: 30 });
    expect(r.revoraCostsMore).toBe(true);
    expect(r.monthlyDifference).toBeLessThan(0);
    expect(r.firstYearDifference).toBeLessThan(0);
  });

  it("ignores bad, negative and oversized input", () => {
    expect(cleanPrice("abc")).toBe(0);
    expect(cleanPrice(-5)).toBe(0);
    expect(cleanPrice(Number.POSITIVE_INFINITY)).toBe(0);
    expect(cleanPrice(1e9)).toBe(MAX_TOOL_PRICE);
    expect(cleanPrice(12.345)).toBe(12.35);
    expect(computeSavings({ website: Number.NaN, crm: -1 }).toolCount).toBe(0);
  });

  it("keeps tool ids unique", () => {
    expect(new Set(SAVINGS_TOOLS.map((t) => t.id)).size).toBe(SAVINGS_TOOLS.length);
  });
});

describe("typicalComparison", () => {
  it("adds up the typical prices and compares them with the canonical first year", () => {
    const c = typicalComparison();
    expect(c.tools.map((tool) => tool.id)).not.toContain("agency");
    expect(c.toolsMonthly).toBe(377);
    expect(c.toolsFirstYear).toBe(4524);
    expect(c.withAgencyMonthly).toBe(877);
    expect(c.withAgencyFirstYear).toBe(10524);
    expect(c.revoraFirstYear).toBe(GROWTH_SYSTEM.setupPrice + GROWTH_SYSTEM.monthlyPrice * 11);
    expect(c.revoraFirstYear).toBe(1450);
    expect(c.toolsDifference).toBe(4524 - 1450);
    expect(c.withAgencyDifference).toBe(10524 - 1450);
  });

  it("agrees with the calculator when every typical price is entered", () => {
    const all = Object.fromEntries(SAVINGS_TOOLS.map((tool) => [tool.id, tool.typical]));
    const r = computeSavings(all);
    const c = typicalComparison();
    expect(r.currentMonthly).toBe(c.withAgencyMonthly);
    expect(r.firstYearDifference).toBe(c.withAgencyDifference);
  });
});
