import { describe, expect, it } from "vitest";
import { compositionFaqItems } from "./composition-faq";
import { faqFactsFor } from "./faq-from-facts";

const faq = { type: "faq_accordion", faqItems: [{ question: "When?", answer: "By appointment." }] };
const section = (root: unknown) => ({ settings: { composition: { version: 1, root } } });

describe("customer FAQ evidence", () => {
  it("uses the saved FAQ facts and deduplicates repeated content", () => {
    expect(compositionFaqItems([section(faq), section(faq)])).toEqual([{ q: "When?", a: "By appointment." }]);
  });
  it("excludes hidden and inactive content", () => {
    expect(compositionFaqItems([
      section({ ...faq, style: { hidden: true } }),
      section({ ...faq, responsive: { mobile: { hidden: true } } }),
      section({ type: "tab_group", tabs: [{ label: "FAQ", children: [faq] }] }),
    ])).toEqual([]);
  });
  it("does not invent questions for invalid or missing compositions", () => {
    expect(compositionFaqItems([section({ type: "faq_accordion", faqItems: [] }), { settings: null }])).toEqual([]);
  });
  it("advertises only answers grounded in the business facts, never a placeholder", () => {
    const facts = faqFactsFor({ businessName: "Acme", profile: { hours: "Mon–Fri 9am–5pm" } });
    const tree = { type: "faq_accordion", faqItems: [
      { question: "What are your hours?", answer: "" },
      { question: "How much is a visit?", answer: "Just $49." },
      { question: "Do you have reviews?", answer: "Rated 4.9 stars." },
    ] };
    expect(compositionFaqItems([section(tree)], facts)).toEqual([{ q: "What are your hours?", a: "Our hours are Mon–Fri 9am–5pm." }]);
  });
});
