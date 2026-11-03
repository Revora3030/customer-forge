/**
 * Property-based tests (fast-check, MIT) for the quote estimate arithmetic.
 * The same function prices the visible calculator and the server recompute,
 * so these invariants protect what lands in the owner's CRM and revenue.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { estimateQuote, recomputeQuote, type QuotePick } from "./quote-estimate";

// Realistic owner figures: whole dollars up to $1M, multipliers 0–10×.
const price = fc.integer({ min: 0, max: 1_000_000 });
const pick: fc.Arbitrary<QuotePick> = fc.oneof(
  price.map((modifier) => ({ modifier, type: "add" })),
  fc.integer({ min: 0, max: 1000 }).map((tenths) => ({ modifier: tenths / 100, type: "multiply" })),
);
const quoteInput = fc.record({
  base: price,
  min: fc.oneof(fc.constant(0), price),
  max: fc.oneof(fc.constant(0), price),
  picks: fc.array(pick, { maxLength: 6 }),
  addons: fc.array(price, { maxLength: 6 }),
});

describe("estimateQuote properties", () => {
  it("min never exceeds max, and both are finite", () => {
    fc.assert(
      fc.property(quoteInput, (input) => {
        const out = estimateQuote(input);
        expect(Number.isFinite(out.min) && Number.isFinite(out.max)).toBe(true);
        expect(out.min).toBeLessThanOrEqual(out.max);
      }),
    );
  });

  it("totals and range are never negative for non-negative owner prices", () => {
    fc.assert(
      fc.property(quoteInput, (input) => {
        const out = estimateQuote(input);
        expect(out.total).toBeGreaterThanOrEqual(0);
        expect(out.min).toBeGreaterThanOrEqual(0);
        expect(out.max).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("respects the owner's floor, and the owner's ceiling unless the floor is higher", () => {
    fc.assert(
      fc.property(quoteInput, (input) => {
        const out = estimateQuote(input);
        expect(out.min).toBeGreaterThanOrEqual(input.min);
        if (input.max > 0) expect(out.max).toBeLessThanOrEqual(Math.max(out.min, Math.round(input.max)));
      }),
    );
  });

  it("adding an add-on never lowers the total, min or max", () => {
    fc.assert(
      fc.property(quoteInput, price, (input, extra) => {
        const before = estimateQuote(input);
        const after = estimateQuote({ ...input, addons: [...input.addons, extra] });
        expect(after.total).toBeGreaterThanOrEqual(before.total);
        expect(after.min).toBeGreaterThanOrEqual(before.min);
        expect(after.max).toBeGreaterThanOrEqual(before.max);
      }),
    );
  });

  it("add-on order does not change the price", () => {
    fc.assert(
      fc.property(quoteInput, fc.infiniteStream(fc.nat()), (input, seeds) => {
        const shuffled = [...input.addons]
          .map((value) => ({ value, key: seeds.next().value }))
          .sort((a, b) => a.key - b.key)
          .map((entry) => entry.value);
        const a = estimateQuote(input);
        const b = estimateQuote({ ...input, addons: shuffled });
        if (input.picks.every((p) => p.type === "add")) {
          // Whole-dollar arithmetic is exact: identical result.
          expect(b).toEqual(a);
        } else {
          // After a fractional multiplier, float addition order can move the
          // last bit of the unrounded total; the quoted range stays within $1.
          expect(Math.abs(b.total - a.total)).toBeLessThanOrEqual(Math.max(1, a.total) * 1e-9);
          expect(Math.abs(b.min - a.min)).toBeLessThanOrEqual(1);
          expect(Math.abs(b.max - a.max)).toBeLessThanOrEqual(1);
        }
      }),
    );
  });

  it("prices stored as strings price the same as numbers", () => {
    fc.assert(
      fc.property(quoteInput, (input) => {
        const asStrings = {
          base: String(input.base),
          min: String(input.min),
          max: String(input.max),
          picks: input.picks.map((p) => ({ ...p, modifier: String(p.modifier) })),
          addons: input.addons.map(String),
        };
        expect(estimateQuote(asStrings)).toEqual(estimateQuote(input));
      }),
    );
  });

  it("garbage numbers are treated as zero, never NaN", () => {
    fc.assert(
      fc.property(fc.oneof(fc.constant(null), fc.constant(undefined), fc.constant("abc"), fc.constant("NaN")), price, (junk, base) => {
        const out = estimateQuote({ base, min: junk, max: junk, picks: [{ modifier: junk as never, type: "add" }], addons: [junk as never] });
        expect(out).toEqual(estimateQuote({ base, min: 0, max: 0, picks: [], addons: [] }));
      }),
    );
  });
});

describe("recomputeQuote properties (server never trusts the browser)", () => {
  const formArb = fc.record({
    form: fc.record({ base_price: price, min_price: fc.oneof(fc.constant(0), price), max_price: fc.oneof(fc.constant(0), price) }),
    optionPrices: fc.array(fc.tuple(price, fc.boolean()), { minLength: 1, maxLength: 4 }),
    addonPrices: fc.array(price, { maxLength: 4 }),
  });
  type Spec = { form: { base_price: number; min_price: number; max_price: number }; optionPrices: [number, boolean][]; addonPrices: number[] };
  const build = ({ form, optionPrices, addonPrices }: Spec) => ({
    form,
    questions: optionPrices.map((_, i) => ({ id: `q${i}`, label: `Question ${i}` })),
    options: optionPrices.map(([modifier, multiply], i) => ({
      question_id: `q${i}`,
      label: `Option ${i}`,
      price_modifier: multiply ? (modifier % 1000) / 100 : modifier,
      modifier_type: multiply ? "multiply" : "add",
    })),
    addons: addonPrices.map((p, i) => ({ label: `Addon ${i}`, price: p })),
  });

  it("matches estimateQuote on the owner's own prices", () => {
    fc.assert(
      fc.property(formArb, (spec) => {
        const quote = build(spec);
        const answers = [
          ...quote.questions.map((q, i) => ({ question: q.label, answer: `Option ${i}` })),
          ...quote.addons.map((a) => ({ question: "Add-on", answer: a.label })),
        ];
        const out = recomputeQuote({ ...quote, answers });
        const expected = estimateQuote({
          base: quote.form.base_price,
          min: quote.form.min_price,
          max: quote.form.max_price,
          picks: quote.options.map((o) => ({ modifier: o.price_modifier, type: o.modifier_type })),
          addons: quote.addons.map((a) => a.price),
        });
        expect({ min: out.min, max: out.max }).toEqual({ min: expected.min, max: expected.max });
      }),
    );
  });

  it("invented answers, duplicate add-ons and fake add-ons cannot change the price", () => {
    fc.assert(
      fc.property(formArb, fc.array(fc.record({ question: fc.string(), answer: fc.string() }), { maxLength: 6 }), (spec, junk) => {
        const quote = build(spec);
        const honest = [
          ...quote.questions.map((q, i) => ({ question: q.label, answer: `Option ${i}` })),
          ...quote.addons.map((a) => ({ question: "Add-on", answer: a.label })),
        ];
        const fakes = junk.filter(
          (j) =>
            !quote.questions.some((q) => q.label === j.question) &&
            !(j.question === "Add-on" && quote.addons.some((a) => a.label === j.answer)),
        );
        const tampered = [...honest, ...honest.filter((a) => a.question === "Add-on"), ...fakes];
        const a = recomputeQuote({ ...quote, answers: honest });
        const b = recomputeQuote({ ...quote, answers: tampered });
        expect({ min: b.min, max: b.max }).toEqual({ min: a.min, max: a.max });
      }),
    );
  });
});
