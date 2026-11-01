import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { validateComposition } from "./composition-tree";
import { CompositionRenderer } from "@/components/site/CompositionRenderer";

const tree = (root: unknown) => ({ version: 1, label: "premium", root });
const bar = (extra: Record<string, unknown>) => tree({ type: "stack", children: [
  { type: "heading", level: 1, text: "Showroom finish.", accentText: "Delivered to your driveway." },
  { type: "mobile_sticky_bar", primaryCta: { label: "Get quote", href: "#quote" }, secondaryCta: { label: "Call", href: "tel:+16140000142" }, ...extra },
] });

describe("premium mobile composition vocabulary", () => {
  it("accepts accentText, tertiaryCta and the tabs layout", () => {
    const r = validateComposition(bar({ tertiaryCta: { label: "Directions", href: "https://www.google.com/maps/dir/?api=1&destination=x" }, barLayout: "tabs" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [heading, sticky] = r.tree.root.children ?? [];
    expect(heading?.accentText).toBe("Delivered to your driveway.");
    expect(sticky?.barLayout).toBe("tabs");
    expect(sticky?.tertiaryCta?.label).toBe("Directions");
    const html = renderToStaticMarkup(createElement(CompositionRenderer, { tree: r.tree, scope: "pm-1" }));
    expect(html).toContain("rv-cn-accent-line");
    expect(html).toContain('data-rv-bar="tabs"');
    expect(html.indexOf('data-rv-slot="secondary"')).toBeLessThan(html.indexOf('data-rv-slot="primary"'));
    expect(html.indexOf('data-rv-slot="primary"')).toBeLessThan(html.indexOf('data-rv-slot="tertiary"'));
  });

  it("rejects bad layouts, unsafe tertiary links and misplaced fields", () => {
    expect(validateComposition(bar({ barLayout: "grid" })).ok).toBe(false);
    expect(validateComposition(bar({ tertiaryCta: { label: "Text us", href: "sms:+16140000142" } })).ok).toBe(false);
    expect(validateComposition(bar({ tertiaryCta: { label: "x", href: "javascript:alert(1)" } })).ok).toBe(false);
    expect(validateComposition(tree({ type: "text", text: "hi", barLayout: "tabs" })).ok).toBe(false);
    expect(validateComposition(tree({ type: "text", text: "hi", accentText: "no" })).ok).toBe(false);
    expect(validateComposition(tree({ type: "heading", text: "hi", accentText: "x".repeat(121) })).ok).toBe(false);
  });

  it("keeps the split bar as the default", () => {
    const r = validateComposition(bar({}));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const html = renderToStaticMarkup(createElement(CompositionRenderer, { tree: r.tree, scope: "pm-1" }));
    expect(html).not.toContain('data-rv-bar="tabs"');
    expect(html).toContain("rv-cn-mobile-sticky-bar");
  });
});
