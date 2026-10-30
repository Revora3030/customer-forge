import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompositionRenderer, isUnpaintedButton, renderedGridSpan } from "./CompositionRenderer";
import type { CompositionNode, CompositionTree } from "@/lib/builder/composition-tree";
import { healLightNode, healStudioNode } from "@/lib/builder/studio-canvas";
import { foldHeaderSubmenus, menuItems } from "@/lib/builder/site-chrome";
import { isDraftChildPath } from "@/lib/builder/draft-route";

const tree = (root: CompositionNode) => ({ version: 1, root }) as CompositionTree;
const render = (root: CompositionNode, scope = "fx") =>
  renderToStaticMarkup(<CompositionRenderer tree={tree(root)} scope={scope} />);
const link = (text: string, href: string, extra: Partial<CompositionNode> = {}): CompositionNode => ({ type: "link", text, href, ...extra });

describe("nav submenus fold into a dropdown (bug 1)", () => {
  const bar: CompositionNode = {
    type: "row",
    children: [
      link("Home", "/"),
      link("Services", "/services"),
      link("Drain Cleaning", "/services/drain-cleaning", { style: { position: "absolute", top: 40, left: 0 } }),
      link("Water Heaters", "/services/water-heaters", { style: { position: "absolute", top: 80 } }),
      link("About", "/about"),
    ],
  };

  it("folds sibling links that point inside a link under it, without their layering", () => {
    const folded = foldHeaderSubmenus(tree(bar)).root;
    expect(folded.children?.map((c) => c.text)).toEqual(["Home", "Services", "About"]);
    const services = folded.children![1]!;
    expect(services.children?.map((c) => c.text)).toEqual(["Drain Cleaning", "Water Heaters"]);
    expect(services.children?.[0]?.style?.position).toBeUndefined();
    expect(services.children?.[0]?.style?.top).toBeUndefined();
  });

  it("folds a parent link followed by a group of links", () => {
    const grouped: CompositionNode = {
      type: "row",
      children: [
        link("Home", "/"),
        { type: "stack", children: [link("Services", "/services"), { type: "stack", children: [link("Drains", "/drains"), link("Leaks", "/leaks")] }] },
      ],
    };
    const folded = foldHeaderSubmenus(tree(grouped)).root;
    expect(folded.children?.[1]?.type).toBe("link");
    expect(folded.children?.[1]?.children?.map((c) => c.text)).toEqual(["Drains", "Leaks"]);
  });

  it("leaves a flat menu bar alone", () => {
    const flat: CompositionNode = { type: "row", children: [link("Home", "/"), link("About", "/about"), link("Contact", "/contact")] };
    expect(foldHeaderSubmenus(tree(flat)).root.children?.every((c) => !c.children)).toBe(true);
  });

  it("renders the folded link as an accessible dropdown in the menu bar, never nested anchors", () => {
    const html = render(foldHeaderSubmenus(tree(bar)).root, "site-header");
    expect(html).toContain('class="rv-nav-group"');
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="[^"]+-menu"/);
    expect(html).toMatch(/<ul id="[^"]+-menu" class="rv-nav-panel"><li><a[^>]*>Drain Cleaning<\/a><\/li>/);
    expect(html).not.toMatch(/<a[^>]*>Services<a/);
    expect(html).toContain(".rv-nav-group:hover>.rv-nav-panel");
  });

  it("indents sub-links in the phone menu list", () => {
    const items = menuItems(tree(bar));
    expect(items.map((i) => [i.label, i.depth])).toEqual([
      ["Home", 0],
      ["Services", 0],
      ["Drain Cleaning", 1],
      ["Water Heaters", 1],
      ["About", 0],
    ]);
  });
});

describe("hero CTA keeps its button styling (bug 2)", () => {
  const cta: CompositionNode = { type: "button", text: "Book a visit", href: "/book", style: { background: "#f4c430", color: "#111111", radius: 999 } };

  it("the studio dark-canvas heal keeps a light button fill and its dark ink", () => {
    const healed = healStudioNode({ type: "stack", style: { background: "#ffffff" }, children: [cta] });
    expect(healed.style?.background).toBeUndefined();
    expect(healed.children?.[0]?.style).toEqual(cta.style);
  });

  it("the light-canvas heal keeps a dark button fill", () => {
    const dark: CompositionNode = { type: "button", text: "Call", href: "/call", style: { background: "#101418", color: "#ffffff" } };
    const healed = healLightNode({ type: "stack", children: [dark] }, { canvas: "#f6f3ee", ink: "#1a1a1a" } as never);
    expect(healed.children?.[0]?.style).toEqual(dark.style);
  });

  it("a button with no fill of its own gets the site's primary fill, not bare text", () => {
    const bare: CompositionNode = { type: "button", text: "Tell us what's going on", href: "/contact", style: { color: "#e8e8e8" } };
    expect(isUnpaintedButton(bare)).toBe(true);
    expect(isUnpaintedButton(cta)).toBe(false);
    const html = render(bare);
    expect(html).toMatch(/<a[^>]*data-rv-button=""[^>]*data-rv-auto=""/);
    expect(html).toContain("[data-rv-button]:where([data-rv-auto]){");
    expect(html).not.toMatch(/data-rv-auto=""[^>]*style="[^"]*color:#e8e8e8/);
    expect(render(cta)).not.toContain('data-rv-auto=""');
  });
});

describe("wheel scrolling on chapter pages (bug 4)", () => {
  it("chapter snap is limited to touch screens", async () => {
    const { CINEMATIC_CSS } = await import("./cinematic-css");
    const snapAt = CINEMATIC_CSS.indexOf("scroll-snap-type:y proximity");
    const media = CINEMATIC_CSS.lastIndexOf("@media", snapAt);
    expect(CINEMATIC_CSS.slice(media, snapAt)).toContain("(hover:none) and (pointer:coarse)");
  });
});

describe("a grid with fewer items than columns (bug 5)", () => {
  it("collapses to the columns its items fill, so the headline is not parked in a narrow track", () => {
    const html = render({
      type: "grid",
      style: { columns: 3 },
      responsive: { desktop: { columns: 3 } },
      children: [
        { type: "heading", level: 1, text: "About Ace Plumbing" },
        { type: "media", mediaRef: "missing-photo" },
      ],
    });
    expect(html).toContain("grid-template-columns:repeat(1, minmax(0, 1fr))");
    expect(html).toMatch(/@media \(min-width: 1024px\)\{\[data-cn="[^"]+"\]\{grid-template-columns:repeat\(1, minmax\(0, 1fr\)\) !important\}\}/);
  });

  it("keeps a full grid as authored", () => {
    const html = render({ type: "grid", style: { columns: 2 }, children: [{ type: "text", text: "A" }, { type: "text", text: "B" }] });
    expect(html).toContain("grid-template-columns:repeat(2, minmax(0, 1fr))");
  });

  it("counts spans", () => {
    const kids: CompositionNode[] = [{ type: "text", text: "wide", style: { span: 2 } }, { type: "text", text: "x" }];
    expect(renderedGridSpan(kids, ["a", "b"])).toBe(3);
    expect(renderedGridSpan(kids, ["a", null])).toBe(2);
  });
});

describe("draft inner pages load on their own (bug 3)", () => {
  it("recognises an inner page address", () => {
    expect(isDraftChildPath("/draft/acme/services", "acme")).toBe(true);
    expect(isDraftChildPath("/draft/acme", "acme")).toBe(false);
    expect(isDraftChildPath("/draft/acme/", "acme")).toBe(false);
    expect(isDraftChildPath("/draft/acme/home", "acme")).toBe(false);
    expect(isDraftChildPath("/draft/other/services", "acme")).toBe(false);
  });
});
