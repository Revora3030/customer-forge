import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TradeCalculator } from "@/components/site/TradeCalculator";
import { PRIMITIVE_GUIDE } from "@/lib/builder/composition-tree";
import {
  calculatorViews,
  financedAmount,
  monthlyPayment,
  parseFinanceFields,
  parsePriceRangeLines,
  parseRoiFields,
  readTradeCalculator,
  roiProjection,
  settingsHostCalculator,
  writeTradeCalculator,
  type TradeCalculatorData,
} from "@/lib/trade-calculator";

const owner = {
  calculator: {
    price_ranges: [{ label: "Driveway", min: 150, max: 300 }],
    finance: { apr: 9.9, terms_months: [36, 12, 12, 24] },
    roi: { value_per_unit: 240, unit: "night", units_per_year: 365, utilization_min: 45, utilization_max: 80, upfront_cost: 50000, annual_costs: 6000 },
  },
};

describe("owner trade calculator data (#14)", () => {
  it("is absent unless the owner supplied it", () => {
    expect(readTradeCalculator(null)).toBeNull();
    expect(readTradeCalculator({})).toBeNull();
    expect(readTradeCalculator({ composition: {} })).toBeNull();
    expect(readTradeCalculator({ calculator: {} })).toBeNull();
  });

  it("reads valid figures and normalises terms", () => {
    const data = readTradeCalculator(owner)!;
    expect(data.priceRanges).toEqual([{ label: "Driveway", min: 150, max: 300 }]);
    expect(data.finance).toEqual({ apr: 9.9, termsMonths: [12, 24, 36] });
    expect(data.roi?.utilizationMax).toBe(80);
  });

  it("drops invalid or partial figures rather than guessing", () => {
    const data = readTradeCalculator({
      calculator: {
        price_ranges: [{ label: "Bad", min: 500, max: 100 }, { label: "", min: 1, max: 2 }, { label: "No max", min: 5 }],
        finance: { apr: 99, terms_months: [12] },
        roi: { value_per_unit: 240, unit: "night", units_per_year: 365, utilization_min: 90, utilization_max: 40 },
      },
    });
    expect(data).toBeNull();
    expect(readTradeCalculator({ calculator: { finance: { apr: 5, terms_months: [1, 1000] } } })).toBeNull();
    expect(readTradeCalculator({ calculator: { finance: { apr: 0, terms_months: [12] } } })?.finance?.apr).toBe(0);
  });

  it("round-trips through settings, keeps other keys, and removes cleanly", () => {
    const data = readTradeCalculator(owner)!;
    const written = writeTradeCalculator({ seo: { anchor: "quote" }, composition: { version: 1 } }, data);
    expect(written["seo"]).toEqual({ anchor: "quote" });
    expect(written["composition"]).toEqual({ version: 1 });
    expect(readTradeCalculator(written)).toEqual(data);
    const removed = writeTradeCalculator(written, null);
    expect("calculator" in removed).toBe(false);
    expect(removed["seo"]).toEqual({ anchor: "quote" });
  });

  it("parses the owner panel fields", () => {
    expect(parsePriceRangeLines("Driveway | 150 | 300\nnonsense\nRoof | 900 | 400")).toEqual([{ label: "Driveway", min: 150, max: 300 }]);
    expect(parseFinanceFields("", "12", "")).toBeUndefined();
    expect(parseFinanceFields("6.5", "12, 24 x", "10")).toEqual({ apr: 6.5, termsMonths: [12, 24], depositPercent: 10 });
    expect(parseRoiFields({ value_per_unit: "", unit: "night" })).toBeUndefined();
    expect(parseRoiFields({ label: "", value_per_unit: "100", unit: "night", units_per_year: "365", utilization_min: "40", utilization_max: "70", upfront_cost: "", annual_costs: "" }))
      .toEqual({ valuePerUnit: 100, unit: "night", unitsPerYear: 365, utilizationMin: 40, utilizationMax: 70 });
  });

  it("computes payments and returns from owner figures only", () => {
    expect(monthlyPayment(1200, 0, 12)).toBe(100);
    expect(monthlyPayment(10000, 6, 36)).toBeCloseTo(304.22, 2);
    expect(monthlyPayment(0, 6, 36)).toBe(0);
    expect(financedAmount(1000, 20)).toBe(800);
    const roi = readTradeCalculator(owner)!.roi!;
    expect(roiProjection(roi, 50)).toEqual({ annualIncome: 43800, annualNet: 37800, paybackYears: 1.3 });
    expect(roiProjection(roi, 100).annualIncome).toBe(Math.round(240 * 365 * 0.8));
  });

  it("only offers finance and ROI views when supplied, estimate first", () => {
    expect(calculatorViews({}, true)).toEqual(["estimate"]);
    expect(calculatorViews(readTradeCalculator(owner)!, true)).toEqual(["estimate", "finance", "roi"]);
    expect(calculatorViews({ finance: { apr: 5, termsMonths: [12] } }, false)).toEqual(["finance"]);
  });

  it("finds sections that host a price calculator", () => {
    const tree = { composition: { version: 1, root: { type: "stack", children: [{ type: "widget", text: "service_estimator" }] } } };
    expect(settingsHostCalculator("composition", tree)).toBe(true);
    expect(settingsHostCalculator("composition", { composition: { root: { type: "widget", text: "booking_form" } } })).toBe(false);
    expect(settingsHostCalculator("quote", null)).toBe(true);
    expect(settingsHostCalculator("hero", tree)).toBe(false);
  });
});

describe("TradeCalculator render (#14)", () => {
  const estimator = <div data-testid="est">existing estimator</div>;

  it("renders just the existing estimator when the owner gave only nothing extra", () => {
    const html = renderToStaticMarkup(<TradeCalculator data={{}} businessName="Acme" estimator={estimator} />);
    expect(html).toBe('<div data-testid="est">existing estimator</div>');
  });

  it("keeps the estimator as the default tab and adds owner-backed tabs", () => {
    const data = readTradeCalculator(owner) as TradeCalculatorData;
    const html = renderToStaticMarkup(<TradeCalculator data={data} businessName="Acme" estimator={estimator} />);
    expect(html).toContain('role="tablist"');
    expect(html).toMatch(/aria-selected="true"[^>]*>Estimate</);
    expect(html).toContain("Monthly payments");
    expect(html).toContain("Return");
    expect(html).toContain("existing estimator");
    expect(html).toContain("Typical price ranges");
    expect(html).toContain("9.9% APR over 36 months");
    expect(html).toContain("not a credit offer");
    expect(html).toContain("not a guarantee of earnings");
    expect(html).toContain('type="range"');
  });

  it("shows no finance or ROI tab without owner data", () => {
    const html = renderToStaticMarkup(<TradeCalculator data={{ priceRanges: [{ label: "Roof", min: 1, max: 2 }] }} businessName="Acme" estimator={estimator} />);
    expect(html).not.toContain("Monthly payments");
    expect(html).not.toContain("role=\"tablist\"");
    expect(html).toContain("Typical price ranges");
  });

  it("tells the AI never to author finance or ROI figures", () => {
    expect(PRIMITIVE_GUIDE).toContain("never write an APR");
    expect(PRIMITIVE_GUIDE).toMatch(/ONLY from figures the owner typed/);
  });
});
