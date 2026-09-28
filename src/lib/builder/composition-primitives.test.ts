import { describe, expect, it } from "vitest";
import { validateComposition } from "./composition-tree";

const m = (src: string) => ({ type: "media", src, alt: "photo" });
const tree = (root: unknown) => ({ version: 1, root });

describe("interactive building blocks", () => {
  it("accepts valid tabs, accordion, compare, gallery, marquee, quote", () => {
    const r = validateComposition(tree({ type: "stack", children: [
      { type: "tabs", children: [{ type: "stack", text: "A", children: [{ type: "text", text: "x" }] }] },
      { type: "accordion", children: [{ type: "card", text: "Q?", children: [{ type: "text", text: "A" }] }] },
      { type: "compare", children: [m("https://a.test/1.jpg"), m("https://a.test/2.jpg")] },
      { type: "gallery", children: [m("https://a.test/3.jpg")] },
      { type: "marquee", children: [{ type: "text", text: "Detailing" }] },
      { type: "quote", text: "Real words", items: ["Owner"] },
    ] }));
    expect(r.ok).toBe(true);
  });
  it("rejects malformed blocks with repairable issues", () => {
    const r = validateComposition(tree({ type: "stack", children: [
      { type: "compare", children: [m("https://a.test/1.jpg")] },
      { type: "tabs", children: [{ type: "stack" }] },
      { type: "gallery", children: [{ type: "text", text: "no" }] },
      { type: "quote" },
    ] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.length).toBeGreaterThanOrEqual(4);
  });
});

describe("studio interactive primitives", () => {
  it("accepts before/after, FAQ, tab group, and mobile sticky bar", () => {
    const r = validateComposition(tree({ type: "stack", children: [
      {
        type: "before_after_slider",
        beforeImage: { src: "https://a.test/before.jpg", alt: "Before renovation", label: "Before" },
        afterImage: { src: "https://a.test/after.jpg", alt: "After renovation", label: "After" },
        initialSplit: 42,
      },
      {
        type: "faq_accordion",
        faqItems: [
          { question: "How long does it take?", answer: "Most supplied projects are completed on the quoted schedule.", defaultOpen: true },
        ],
      },
      {
        type: "tab_group",
        tabs: [
          { label: "Standard", children: [{ type: "text", text: "Standard service" }] },
          { label: "Premium", children: [{ type: "text", text: "Premium service" }] },
        ],
      },
      {
        type: "mobile_sticky_bar",
        primaryCta: { label: "Call Now", href: "tel:+15551234567" },
        secondaryCta: { label: "Book Online", href: "https://a.test/book" },
      },
    ] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const nodes = r.tree.root.children ?? [];
      expect(nodes[0]?.initialSplit).toBe(42);
      expect(nodes[1]?.faqItems?.[0]?.defaultOpen).toBe(true);
      expect(nodes[2]?.tabs?.length).toBe(2);
      expect(nodes[3]?.primaryCta?.href).toBe("tel:+15551234567");
    }
  });

  it("rejects malformed studio interactive primitives", () => {
    const r = validateComposition(tree({ type: "stack", children: [
      { type: "before_after_slider", beforeImage: { src: "javascript:alert(1)", alt: "x", label: "Before" }, afterImage: { src: "https://a.test/a.jpg", alt: "x", label: "After" } },
      { type: "faq_accordion", faqItems: [] },
      { type: "tab_group", tabs: [{ label: "Only", children: "bad" }] },
      { type: "mobile_sticky_bar", primaryCta: { label: "Call", href: "javascript:alert(1)" } },
    ] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.length).toBeGreaterThanOrEqual(4);
  });
});

describe("toggle block", () => {
  it("needs exactly two labelled options", () => {
    const opt = (text: string) => ({ type: "stack", text, children: [{ type: "text", text: "x" }] });
    expect(validateComposition(tree({ type: "toggle", children: [opt("A"), opt("B")] })).ok).toBe(true);
    expect(validateComposition(tree({ type: "toggle", children: [opt("A")] })).ok).toBe(false);
  });
});
