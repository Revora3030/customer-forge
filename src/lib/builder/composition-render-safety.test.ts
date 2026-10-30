import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CompositionRenderer, PHONE_SAFETY_CSS } from "@/components/site/CompositionRenderer";
import { readComposition, validateComposition, type CompositionTree } from "./composition-tree";

const tree = (style: Record<string, unknown>, type = "text") => ({
  version: 1,
  root: { type: "stack", children: [{ type, text: "Hello", style }] },
});

describe("composition render safety", () => {
  it("still renders a saved section with a quality finding (low contrast)", () => {
    const settings = { composition: tree({ color: "#777777", background: "#888888" }) };
    expect(readComposition(settings)).not.toBeNull();
  });
  it("generation stays strict so the AI repairs the finding", () => {
    expect(validateComposition(tree({ color: "#777777", background: "#888888" })).ok).toBe(false);
  });
  it("never renders unsafe content", () => {
    const settings = { composition: { version: 1, root: { type: "text", text: "<script>alert(1)</script>" } } };
    expect(readComposition(settings)).toBeNull();
    const bad = { composition: { version: 1, root: { type: "link", text: "x", href: "javascript:alert(1)" } } };
    expect(readComposition(bad)).toBeNull();
  });
  it("accepts 3:1 contrast for large headings (WCAG large text)", () => {
    const heading = tree({ color: "#949494", background: "#ffffff", size: 48 }, "heading");
    expect(validateComposition(heading).ok).toBe(true);
    const small = tree({ color: "#949494", background: "#ffffff", size: 14 });
    expect(validateComposition(small).ok).toBe(false);
  });
});

const draw = (t: CompositionTree, scope: string, resolveMedia?: (ref: string) => { url: string; visual?: { source?: string } } | null) =>
  renderToStaticMarkup(createElement(CompositionRenderer, { tree: t, scope, as: "div", ...(resolveMedia ? { resolveMedia: resolveMedia as never } : {}) }));

describe("site chrome never adds a second h1", () => {
  const wordmark: CompositionTree = { version: 1, root: { type: "row", children: [{ type: "heading", level: 1, text: "Elite mobile detail", style: { size: 22 } }] } };
  it("draws a level-1 heading in the header and footer as text with the same style", () => {
    for (const scope of ["site-header", "site-footer"]) {
      const html = draw(wordmark, scope);
      expect(html).not.toContain("<h1");
      expect(html).toMatch(/<p[^>]*>Elite mobile detail<\/p>/);
      expect(html).toContain("--rv-mfs:22px");
    }
  });
  it("keeps the page's own h1 in a page section", () => {
    expect(draw(wordmark, "section-1")).toContain("<h1");
  });
});

describe("phone heading cap respects the AI's own sizes", () => {
  it("writes the AI's phone size (else its size) and line height for the cap", () => {
    const t: CompositionTree = { version: 1, root: { type: "stack", children: [
      { type: "heading", level: 1, text: "Big", style: { size: 72, lineHeight: 1.2 }, responsive: { mobile: { size: 30 } } },
      { type: "heading", level: 2, text: "Mid", style: { size: 40 } },
    ] } };
    const html = draw(t, "s1");
    expect(html).toContain("--rv-mfs:30px");
    expect(html).toContain("--rv-mlh:1.2");
    expect(html).toContain("--rv-mfs:40px");
    expect(PHONE_SAFETY_CSS).toContain("h1{font-size:min(var(--rv-mfs,2.75rem),2.75rem,11vw)!important;line-height:max(1.05,var(--rv-mlh,1.05))!important}");
  });
});

describe("first-build picture sources", () => {
  const media = (node: Record<string, unknown>) => ({ version: 1, root: { type: "stack", children: [node] } });
  it("rejects an external https picture and accepts a mediaRef or a real logo", () => {
    const external = validateComposition(media({ type: "media", src: "https://images.example.com/car.jpg", alt: "Car" }), { firstBuild: true });
    expect(external.ok).toBe(false);
    if (!external.ok) expect(external.issues.some((issue) => /use a mediaRef/.test(issue.problem))).toBe(true);
    expect(validateComposition(media({ type: "media", src: "https://img.logo.dev/stripe.com", alt: "Stripe logo" }), { firstBuild: true }).ok).toBe(true);
    const ref = "11111111-1111-4111-8111-111111111111";
    expect(validateComposition(media({ type: "media", mediaRef: ref, alt: "Car" }), { firstBuild: true, allowedMediaRefs: new Set([ref]) }).ok).toBe(true);
    // Outside first builds the behaviour is unchanged.
    expect(validateComposition(media({ type: "media", src: "https://images.example.com/car.jpg", alt: "Car" })).ok).toBe(true);
  });
  it("rejects external slider pictures in first builds", () => {
    const slider = media({ type: "before_after_slider", beforeImage: { src: "https://x.example/a.jpg", alt: "a", label: "Before" }, afterImage: { src: "https://x.example/b.jpg", alt: "b", label: "After" } });
    expect(validateComposition(slider, { firstBuild: true }).ok).toBe(false);
    expect(validateComposition(slider).ok).toBe(true);
  });
});

describe("before/after slider provenance", () => {
  const slider: CompositionTree = { version: 1, root: { type: "before_after_slider", beforeImage: { mediaRef: "temp_before", alt: "Seat before", label: "Before" }, afterImage: { mediaRef: "temp_after", alt: "Seat after", label: "After" } } };
  it("shows a generated pair only in labeled example mode, never as real work", () => {
    const html = draw(slider, "proof", (ref) => ({ url: `https://cdn.example/${ref}.jpg`, visual: { source: ref === "temp_after" ? "generated" : "owner" } }));
    expect(html).toContain('data-rv-example="before_after"');
    expect(html).toContain("Example illustration — not a photo of our work");
  });
  it("renders the owner's real pair through the media map", () => {
    const html = draw(slider, "proof", (ref) => ({ url: `https://cdn.example/${ref}.jpg`, visual: { source: "owner" } }));
    expect(html).toContain("temp_before.jpg");
    expect(html).toContain("temp_after.jpg");
  });
});
