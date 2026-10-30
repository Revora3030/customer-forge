import { describe, expect, it } from "vitest";
import { compositionFaqItems } from "./composition-faq";

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
});