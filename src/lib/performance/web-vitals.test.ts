import { describe, expect, it } from "vitest";
import {
  formatVital,
  percentile75,
  rateVital,
  summariseVitals,
  VITAL_THRESHOLDS,
} from "./web-vitals";

describe("rateVital", () => {
  it("uses the published Core Web Vitals thresholds", () => {
    expect(rateVital("lcp", 2500)).toBe("good");
    expect(rateVital("lcp", 2501)).toBe("needs-improvement");
    expect(rateVital("lcp", 4001)).toBe("poor");
    expect(rateVital("cls", 0.09)).toBe("good");
    expect(rateVital("cls", 0.2)).toBe("needs-improvement");
    expect(rateVital("cls", 0.4)).toBe("poor");
    expect(rateVital("inp", VITAL_THRESHOLDS.inp.good)).toBe("good");
  });

  it("never reports a nonsense value as good", () => {
    expect(rateVital("lcp", Number.NaN)).toBe("poor");
    expect(rateVital("lcp", -10)).toBe("poor");
  });
});

describe("percentile75", () => {
  it("returns null with no measurements instead of inventing one", () => {
    expect(percentile75([])).toBeNull();
  });

  it("reflects the slower end of real visits", () => {
    expect(percentile75([100, 200, 300, 400])).toBe(300);
    expect(percentile75([1000])).toBe(1000);
  });
});

describe("summariseVitals", () => {
  it("marks metrics with no data as not measured", () => {
    const summary = summariseVitals([]);
    expect(summary).toHaveLength(5);
    for (const row of summary) {
      expect(row.samples).toBe(0);
      expect(row.p75).toBeNull();
      expect(row.rating).toBe("not-measured");
    }
  });

  it("scores only from recorded measurements", () => {
    const summary = summariseVitals([
      { metric: "lcp", value: 1000 },
      { metric: "lcp", value: 1200 },
      { metric: "lcp", value: "5000" },
      { metric: "cls", value: 0.02 },
      { metric: "unknown", value: 9 },
    ]);
    const lcp = summary.find((row) => row.metric === "lcp")!;
    expect(lcp.samples).toBe(3);
    expect(lcp.p75).toBe(5000);
    expect(lcp.rating).toBe("poor");
    const cls = summary.find((row) => row.metric === "cls")!;
    expect(cls.samples).toBe(1);
    expect(cls.rating).toBe("good");
    const inp = summary.find((row) => row.metric === "inp")!;
    expect(inp.rating).toBe("not-measured");
  });
});

describe("formatVital", () => {
  it("reads the way an owner expects", () => {
    expect(formatVital("cls", 0.0512)).toBe("0.051");
    expect(formatVital("lcp", 2480)).toBe("2.48s");
    expect(formatVital("inp", 120)).toBe("120ms");
  });
});
