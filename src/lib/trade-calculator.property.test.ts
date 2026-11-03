/**
 * Property-based tests (fast-check, MIT) for the owner trade calculator:
 * finance maths, ROI projection, and the settings reader/writer that guards
 * every figure a visitor sees.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  financedAmount,
  formatPriceRangeLines,
  monthlyPayment,
  parsePriceRangeLines,
  readTradeCalculator,
  roiProjection,
  writeTradeCalculator,
  type PriceRange,
  type RoiInputs,
} from "./trade-calculator";

const cents = (max: number) => fc.integer({ min: 1, max: max * 100 }).map((c) => c / 100);
const principal = cents(1_000_000);
const apr = fc.integer({ min: 0, max: 6000 }).map((bp) => bp / 100); // 0–60%
const months = fc.integer({ min: 3, max: 360 });

describe("monthlyPayment properties", () => {
  it("is never negative and is zero for no principal or no term", () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true }), apr, fc.integer({ min: -12, max: 360 }), (p, rate, m) => {
        const pay = monthlyPayment(p, rate, m);
        expect(pay).toBeGreaterThanOrEqual(0);
        if (!(p > 0) || !(m > 0)) expect(pay).toBe(0);
      }),
    );
  });

  it("at 0% APR divides the principal evenly", () => {
    fc.assert(
      fc.property(principal, months, (p, m) => {
        expect(monthlyPayment(p, 0, m)).toBe(Math.round((p / m) * 100) / 100);
      }),
    );
  });

  it("over the full term repays at least the principal (to the cent)", () => {
    fc.assert(
      fc.property(principal, apr, months, (p, rate, m) => {
        expect(monthlyPayment(p, rate, m) * m).toBeGreaterThanOrEqual(p - m * 0.005 - 1e-6);
      }),
    );
  });

  it("never goes down when the APR goes up, or up when the term gets longer", () => {
    fc.assert(
      fc.property(principal, apr, apr, months, months, (p, r1, r2, m1, m2) => {
        const [lo, hi] = r1 <= r2 ? [r1, r2] : [r2, r1];
        expect(monthlyPayment(p, hi, m1)).toBeGreaterThanOrEqual(monthlyPayment(p, lo, m1));
        const [short, long] = m1 <= m2 ? [m1, m2] : [m2, m1];
        expect(monthlyPayment(p, r1, long)).toBeLessThanOrEqual(monthlyPayment(p, r1, short));
      }),
    );
  });
});

describe("financedAmount properties", () => {
  it("stays between zero and the price for a deposit under 100%", () => {
    fc.assert(
      fc.property(principal, fc.integer({ min: 0, max: 9999 }).map((d) => d / 100), (price, deposit) => {
        const financed = financedAmount(price, deposit);
        expect(financed).toBeGreaterThanOrEqual(0);
        expect(financed).toBeLessThanOrEqual(price);
      }),
    );
  });

  it("with no deposit finances the whole price", () => {
    fc.assert(
      fc.property(principal, (price) => {
        expect(financedAmount(price)).toBe(price);
      }),
    );
  });
});

describe("roiProjection properties", () => {
  const roiArb: fc.Arbitrary<RoiInputs> = fc
    .record({
      valuePerUnit: cents(10_000),
      unitsPerYear: fc.integer({ min: 1, max: 8760 }),
      a: fc.integer({ min: 0, max: 100 }),
      b: fc.integer({ min: 0, max: 100 }),
      upfrontCost: fc.option(cents(1_000_000), { nil: undefined }),
      annualCosts: fc.option(cents(100_000), { nil: undefined }),
    })
    .map(({ a, b, upfrontCost, annualCosts, ...rest }) => ({
      ...rest,
      unit: "night",
      utilizationMin: Math.min(a, b),
      utilizationMax: Math.max(a, b),
      ...(upfrontCost !== undefined ? { upfrontCost } : {}),
      ...(annualCosts !== undefined ? { annualCosts } : {}),
    }));

  it("clamps utilisation into the owner's band", () => {
    fc.assert(
      fc.property(roiArb, fc.integer({ min: -50, max: 200 }), (roi, u) => {
        const clamped = Math.min(roi.utilizationMax, Math.max(roi.utilizationMin, u));
        expect(roiProjection(roi, u)).toEqual(roiProjection(roi, clamped));
      }),
    );
  });

  it("income never drops as utilisation rises", () => {
    fc.assert(
      fc.property(roiArb, fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 }), (roi, u1, u2) => {
        const [lo, hi] = u1 <= u2 ? [u1, u2] : [u2, u1];
        expect(roiProjection(roi, hi).annualIncome).toBeGreaterThanOrEqual(roiProjection(roi, lo).annualIncome);
      }),
    );
  });

  it("only promises a payback when there is an upfront cost and a positive net", () => {
    fc.assert(
      fc.property(roiArb, fc.integer({ min: 0, max: 100 }), (roi, u) => {
        const out = roiProjection(roi, u);
        if (out.paybackYears !== null) {
          expect(out.annualNet).toBeGreaterThan(0);
          expect(roi.upfrontCost).toBeGreaterThan(0);
          expect(out.paybackYears).toBeGreaterThanOrEqual(0);
        } else {
          expect(!roi.upfrontCost || out.annualNet <= 0).toBe(true);
        }
      }),
    );
  });
});

describe("settings reader/writer properties", () => {
  it("never throws on arbitrary JSON, and anything it returns is valid", () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.jsonValue(), (calculator, other) => {
        const data = readTradeCalculator({ calculator, other });
        if (!data) return;
        for (const r of data.priceRanges ?? []) {
          expect(r.min).toBeGreaterThan(0);
          expect(r.max).toBeGreaterThanOrEqual(r.min);
          expect(r.label.length).toBeLessThanOrEqual(60);
        }
        expect((data.priceRanges ?? []).length).toBeLessThanOrEqual(8);
        if (data.finance) {
          expect(data.finance.apr).toBeGreaterThanOrEqual(0);
          expect(data.finance.apr).toBeLessThanOrEqual(60);
          const terms = data.finance.termsMonths;
          expect(terms.length).toBeGreaterThan(0);
          expect(terms.length).toBeLessThanOrEqual(6);
          expect([...terms].sort((a, b) => a - b)).toEqual(terms);
          expect(new Set(terms).size).toBe(terms.length);
          for (const t of terms) expect(Number.isInteger(t) && t >= 3 && t <= 360).toBe(true);
          if (data.finance.depositPercent !== undefined) expect(data.finance.depositPercent).toBeLessThan(100);
        }
        if (data.roi) {
          expect(data.roi.utilizationMin).toBeLessThanOrEqual(data.roi.utilizationMax);
          expect(data.roi.utilizationMax).toBeLessThanOrEqual(100);
        }
      }),
    );
  });

  it("write then read round-trips valid data and keeps other settings keys", () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.jsonValue(), (calculator, keep) => {
        const data = readTradeCalculator({ calculator });
        if (!data) return;
        const written = writeTradeCalculator({ keep, calculator: "stale" }, data);
        expect(written["keep"]).toEqual(keep);
        expect(readTradeCalculator(written)).toEqual(data);
      }),
    );
  });

  it("writing null removes only the calculator", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string().filter((k) => k !== "calculator" && k !== "__proto__"), fc.jsonValue()), (rest) => {
        expect(writeTradeCalculator({ ...rest, calculator: { price_ranges: [] } }, null)).toEqual(rest);
      }),
    );
  });

  it("owner panel price lines round-trip through format and parse", () => {
    const label = fc
      .stringMatching(/^[A-Za-z0-9][A-Za-z0-9 &'-]{0,58}[A-Za-z0-9]$/)
      .map((s) => s.replace(/\s+/g, " "));
    const range: fc.Arbitrary<PriceRange> = fc
      .tuple(label, fc.integer({ min: 1, max: 10_000_000 }), fc.integer({ min: 0, max: 10_000_000 }))
      .map(([l, minCents, extra]) => ({ label: l, min: minCents / 100, max: (minCents + extra) / 100 }));
    fc.assert(
      fc.property(fc.array(range, { minLength: 1, maxLength: 8 }), (ranges) => {
        expect(parsePriceRangeLines(formatPriceRangeLines(ranges))).toEqual(ranges);
      }),
    );
  });
});
