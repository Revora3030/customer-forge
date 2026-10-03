import { describe, expect, it } from "vitest";
import { recomputeQuote } from "./quote-estimate";

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
