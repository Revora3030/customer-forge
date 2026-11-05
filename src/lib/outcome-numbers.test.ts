import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { averageEstimate, conversionLabel } from "./outcome-numbers";

describe("averageEstimate", () => {
  it("is empty with no estimates, instead of a $0 average", () => {
    expect(averageEstimate([])).toEqual({ value: 0, count: 0 });
    expect(averageEstimate([{ estimated_value: null }, { estimated_value: 0 }])).toEqual({
      value: 0,
      count: 0,
    });
  });

  it("averages only leads that carry an estimate", () => {
    expect(
      averageEstimate([
        { estimated_value: 200 },
        { estimated_value: null },
        { estimated_value: "400" },
        {},
      ]),
    ).toEqual({ value: 300, count: 2 });
  });
});

describe("owner dashboard money labels say they are estimates", () => {
  const index = readFileSync("src/routes/_authenticated/app.index.tsx", "utf8");
  const analytics = readFileSync("src/routes/_authenticated/app.analytics.tsx", "utf8");
  it("dashboard", () => {
    expect(index).toContain("estimated value of completed jobs");
    expect(index).toContain('label="Average estimate"');
    expect(index).not.toContain("Average job value");
  });
  it("analytics booked value matches what it sums (booked + completed)", () => {
    expect(analytics).toContain('hint="estimated, from booked and won leads"');
    expect(analytics).not.toContain('hint="from won leads"');
  });
});

describe("conversionLabel", () => {
  it("shows — with no visitors instead of 0.0%", () => {
    expect(conversionLabel(0, 0)).toBe("—");
    expect(conversionLabel(3, 0)).toBe("—");
  });
  it("shows a percentage when there were visitors", () => {
    expect(conversionLabel(0, 10)).toBe("0.0%");
    expect(conversionLabel(1, 8)).toBe("12.5%");
  });
  it("is used on the dashboard and analytics", () => {
    for (const f of [
      "src/routes/_authenticated/app.index.tsx",
      "src/routes/_authenticated/app.analytics.tsx",
    ]) {
      expect(readFileSync(f, "utf8")).toContain("conversionLabel(");
    }
  });
});
