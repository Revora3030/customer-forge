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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { clampSplit, splitForKey, splitForPointer, SLIDER_STEP } from "./compare-slider";

describe("before/after slider: keyboard, pointer and ARIA", () => {
  it("steps 5% with arrow keys and jumps with Home/End", () => {
    expect(SLIDER_STEP).toBe(5);
    expect(splitForKey("ArrowRight", 50)).toBe(55);
    expect(splitForKey("ArrowLeft", 50)).toBe(45);
    expect(splitForKey("ArrowUp", 98)).toBe(100);
    expect(splitForKey("ArrowDown", 2)).toBe(0);
    expect(splitForKey("Home", 63)).toBe(0);
    expect(splitForKey("End", 12)).toBe(100);
    expect(splitForKey("PageUp", 50)).toBe(70);
    expect(splitForKey("a", 50)).toBeNull();
  });

  it("maps a pointer across the full 0–100% width", () => {
    expect(splitForPointer(100, 100, 400)).toBe(0);
    expect(splitForPointer(500, 100, 400)).toBe(100);
    expect(splitForPointer(300, 100, 400)).toBe(50);
    expect(splitForPointer(-50, 100, 400)).toBe(0);
    expect(splitForPointer(10, 0, 0)).toBe(50);
    expect(clampSplit(Number.NaN)).toBe(50);
  });

  it("renders a real slider with full ARIA semantics and no distortion", () => {
    const source = readFileSync(resolve(__dirname, "../../components/site/CompositionRenderer.tsx"), "utf8");
    const slider = source.slice(source.indexOf("function BeforeAfterSlider("), source.indexOf("function FaqAccordion("));
    for (const attr of ['role="slider"', 'aria-label="Before and after comparison slider"', "aria-valuemin={0}", "aria-valuemax={100}", "aria-valuenow={Math.round(pos)}", "tabIndex={0}", "onPointerDown", "onKeyDown"]) expect(slider).toContain(attr);
    expect(slider.match(/objectFit: "cover"/g)?.length).toBe(2);
    expect(source).toContain("backdrop-filter:blur(8px)");
    expect(source).toMatch(/prefers-reduced-motion: reduce\)\{\.rv-cn-compare-handle/);
  });
});
