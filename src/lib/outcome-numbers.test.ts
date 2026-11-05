import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { averageEstimate } from "./outcome-numbers";

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
