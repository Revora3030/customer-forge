import { describe, expect, it } from "vitest";
import { GROWTH_SYSTEM } from "./offer";
import { CANCELABLE_TOOLS, parseMonthly, readEntries, toolsTotals } from "./tools-you-can-cancel";

describe("tools you can cancel", () => {
  it("only lists features that are on the /pricing included list", () => {
    for (const tool of CANCELABLE_TOOLS) expect(GROWTH_SYSTEM.includes).toContain(tool.feature);
    expect(new Set(CANCELABLE_TOOLS.map((t) => t.key)).size).toBe(CANCELABLE_TOOLS.length);
  });
  it("parses typed amounts and treats blank or junk as zero", () => {
    expect(parseMonthly("29")).toBe(29);
    expect(parseMonthly("$1,299.50")).toBe(1299.5);
    expect(parseMonthly("")).toBe(0);
    expect(parseMonthly("abc")).toBe(0);
    expect(parseMonthly("-5")).toBe(0);
    expect(parseMonthly("1e9")).toBe(0);
    expect(parseMonthly(undefined)).toBe(0);
    expect(parseMonthly("999999999")).toBe(100000);
  });
  it("shows no savings out of nothing: empty entries total $0 and net is minus the plan price", () => {
    expect(toolsTotals({})).toEqual({ monthlyTotal: 0, revoraMonthly: 100, net: -100, yearly: -1200 });
  });
  it("totals the owner's own numbers minus $100 a month", () => {
    const t = toolsTotals({ website: "40", crm: "49.99", booking: "30", reviews: "x" });
    expect(t.monthlyTotal).toBe(119.99);
    expect(t.net).toBe(19.99);
    expect(t.revoraMonthly).toBe(GROWTH_SYSTEM.monthlyPrice);
  });
  it("reads saved entries safely", () => {
    expect(readEntries(null)).toEqual({});
    expect(readEntries("{bad")).toEqual({});
    expect(readEntries(JSON.stringify({ website: "10", other: "99", crm: 5 }))).toEqual({ website: "10" });
  });
});
