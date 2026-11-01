import { describe, expect, it } from "vitest";
import { GROWTH_SYSTEM } from "@/lib/offer";
import {
  MAX_TOOL_PRICE,
  PRICES_CHECKED_ISO,
  PRICES_CHECKED_LABEL,
  SAVINGS_TOOLS,
  cleanPrice,
  computeSavings,
  typicalComparison,
  type SavingsTool,
} from "./software-savings";

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
    expect(r.firstYearDifference).toBeLessThan(0);
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
  it("adds up only the prices read from public vendor pages and compares them with the canonical first year", () => {
    const c = typicalComparison();
    expect(c.tools.map((tool) => tool.id)).toEqual(["website", "scheduling", "forms", "crm", "email", "automation"]);
    expect(c.tools.map((tool) => tool.typical)).toEqual([19, 10, 34, 14, 10.2, 19.99]);
    expect(c.toolsMonthly).toBe(107.19);
    expect(c.toolsFirstYear).toBe(1286.28);
    expect(c.revoraFirstYear).toBe(GROWTH_SYSTEM.setupPrice + GROWTH_SYSTEM.monthlyPrice * 11);
    expect(c.revoraFirstYear).toBe(1450);
    expect(c.toolsDifference).toBe(-163.72);
    expect(c.toolsCostLess).toBe(true);
    expect(c.unpriced).toEqual(["Review requests", "Web agency or freelancer retainer"]);
    expect(c.checked).toBe(PRICES_CHECKED_LABEL);
  });

  it("gives every counted price an https vendor URL and the date it was checked, and never counts an unsourced one", () => {
    expect(PRICES_CHECKED_ISO).toBe("2026-10-31");
    for (const tool of SAVINGS_TOOLS as readonly SavingsTool[]) {
      if (tool.typical === null) {
        expect(tool.source, tool.id).toBeUndefined();
      } else {
        expect(tool.source, tool.id).toBeDefined();
        expect(tool.source?.url, tool.id).toMatch(/^https:\/\//);
        expect(tool.typical, tool.id).toBeGreaterThan(0);
      }
    }
    expect(typicalComparison().tools.every((tool) => tool.source.url.startsWith("https://"))).toBe(true);
  });

  it("names vendors only where a source exists and keeps category wording generic elsewhere", () => {
    const vendors = ["Wix", "Squarespace", "Webflow", "Calendly", "Acuity", "Typeform", "Jotform", "HubSpot", "Pipedrive", "Mailchimp", "Constant Contact", "Zapier", "Podium", "Birdeye"];
    for (const tool of SAVINGS_TOOLS as readonly SavingsTool[]) {
      for (const vendor of vendors) {
        expect(`${tool.label} ${tool.example}`.includes(vendor), `${tool.id} mentions ${vendor}`).toBe(false);
      }
    }
  });

  it("agrees with the calculator when every sourced price is entered", () => {
    const all = Object.fromEntries(
      (SAVINGS_TOOLS as readonly SavingsTool[]).filter((tool) => tool.typical !== null).map((tool) => [tool.id, tool.typical]),
    );
    const r = computeSavings(all);
    const c = typicalComparison();
    expect(r.currentMonthly).toBe(c.toolsMonthly);
    expect(r.firstYearDifference).toBe(c.toolsDifference);
    expect(r.firstYearDifference).toBeLessThan(0);
  });
});
