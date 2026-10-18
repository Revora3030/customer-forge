import { describe, expect, it } from "vitest";
import { estimateQuote, isUsableQuote, recomputeQuote } from "./quote-estimate";

const base = {
  form: { base_price: 100, min_price: 0, max_price: 0 },
  questions: [{ id: "q1", label: "Size" }],
  options: [
    { question_id: "q1", label: "Large", price_modifier: 2, modifier_type: "multiply" },
    { question_id: "q1", label: "Small", price_modifier: 10, modifier_type: "add" },
  ],
  addons: [{ label: "Rush", price: 50 }],
};

describe("recomputeQuote", () => {
  it("uses the owner's prices, not the browser's", () => {
    const result = recomputeQuote({
      ...base,
      answers: [
        { question: "Size", answer: "Large" },
        { question: "Add-on", answer: "Rush" },
      ],
    });
    expect(result.min).toBe(225);
    expect(result.max).toBe(288);
  });
  it("ignores answers and add-ons that are not on the form", () => {
    const result = recomputeQuote({
      ...base,
      answers: [
        { question: "Size", answer: "Gold plated" },
        { question: "Add-on", answer: "Free money" },
      ],
    });
    expect(result.answers).toEqual([]);
    expect(result.min).toBe(90);
  });
});

describe("estimateQuote parity with the server recompute", () => {
  const cases = [
    { name: "add", form: { base_price: 100, min_price: 0, max_price: 0 }, answers: [{ question: "Size", answer: "Small" }] },
    { name: "multiply then add-on", form: { base_price: 100, min_price: 0, max_price: 0 }, answers: [{ question: "Size", answer: "Large" }, { question: "Add-on", answer: "Rush" }] },
    { name: "owner minimum wins", form: { base_price: 100, min_price: 500, max_price: 0 }, answers: [{ question: "Size", answer: "Small" }] },
    { name: "owner maximum caps", form: { base_price: 100, min_price: 0, max_price: 120 }, answers: [{ question: "Size", answer: "Large" }] },
    { name: "string amounts", form: { base_price: "100", min_price: null, max_price: null }, answers: [{ question: "Add-on", answer: "Rush" }] },
  ];
  for (const testCase of cases) {
    it(testCase.name, () => {
      const server = recomputeQuote({ ...base, form: testCase.form, answers: testCase.answers });
      const picks = server.answers.filter((a) => a.question !== "Add-on").map((a) => ({
        modifier: a.modifier,
        type: base.options.find((o) => o.label === a.answer)?.modifier_type ?? null,
      }));
      const addons = server.answers.filter((a) => a.question === "Add-on").map((a) => a.modifier);
      const client = estimateQuote({ base: testCase.form.base_price, min: testCase.form.min_price, max: testCase.form.max_price, picks, addons });
      expect({ min: client.min, max: client.max }).toEqual({ min: server.min, max: server.max });
    });
  }
  it("keeps the documented numbers", () => {
    expect(estimateQuote({ base: 100, min: 0, max: 0, picks: [{ modifier: 2, type: "multiply" }], addons: [50] })).toEqual({ total: 250, min: 225, max: 288 });
    expect(estimateQuote({ base: 100, min: 0, max: 120, picks: [{ modifier: 2, type: "multiply" }], addons: [] }).max).toBe(180);
  });
});

describe("isUsableQuote", () => {
  it("needs at least one question with options", () => {
    expect(isUsableQuote([])).toBe(false);
    expect(isUsableQuote(null)).toBe(false);
    expect(isUsableQuote([{ options: [] }, { options: null }])).toBe(false);
    expect(isUsableQuote([{ options: [] }, { options: [{ id: "o1" }] }])).toBe(true);
  });
});
