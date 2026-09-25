import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readComposition, validateComposition, writeComposition } from "./composition-tree";
import { readActions } from "@/lib/site-agent";
import { CompositionRenderer } from "@/components/site/CompositionRenderer";

// A structure no old archetype or section kind describes: an asymmetric
// offer grid with an overlapping proof ribbon and a mobile-first reflow.
const novel = {
  version: 1,
  label: "Asymmetric offer lattice",
  root: {
    type: "grid",
    style: { columns: 7, gap: 18, paddingY: 96, background: "#0B0B0C", color: "#F5E6B8" },
    responsive: { mobile: { columns: 1, paddingY: 40 }, tablet: { columns: 3 } },
    children: [
      { type: "heading", level: 1, text: "Built around how you actually book", style: { span: 4, size: 72, italic: true, font: "Fraunces" }, motion: { kind: "rise" } },
      { type: "stack", style: { span: 3, gap: 12 }, children: [
        { type: "text", text: "Pick a slot, we confirm by text." },
        { type: "button", text: "Book a time", href: "/book", style: { background: "#F5E6B8", color: "#0B0B0C", radius: 999, paddingX: 28 } },
      ] },
      { type: "row", style: { span: 7, justify: "between" }, children: [
        { type: "icon", text: "✦" }, { type: "divider" }, { type: "link", text: "See services", href: "/services" },
      ] },
    ],
  },
};

describe("AI-authored compositions", () => {
  it("accepts a novel structure unchanged", () => {
    const result = validateComposition(novel);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tree.root.children?.map((c) => c.type)).toEqual(["heading", "stack", "row"]);
  });

  it("renders it with responsive overrides and reduced-motion-safe animation", () => {
    const result = validateComposition(novel);
    if (!result.ok) throw new Error("invalid");
    const html = renderToStaticMarkup(createElement(CompositionRenderer, { tree: result.tree, scope: "s-1" }));
    expect(html).toContain("Built around how you actually book");
    expect(html).toContain("grid-template-columns:repeat(7, minmax(0, 1fr))");
    expect(html).toContain("@media (max-width: 639px)");
    expect(html).toContain("prefers-reduced-motion: no-preference");
    expect(html).toContain('href="/book"');
  });

  it("rejects unsafe output with issues and never a substitute design", () => {
    const bad = {
      version: 1,
      root: { type: "stack", children: [
        { type: "link", text: "x", href: "javascript:alert(1)" },
        { type: "text", text: "<script>x</script>" },
        { type: "text", text: "hi", style: { color: "#777777", background: "#888888" } },
        { type: "media", src: "https://example.com/a.jpg" },
        { type: "carousel" },
      ] },
    };
    const result = validateComposition(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const problems = result.issues.map((i) => i.problem).join(" | ");
      expect(problems).toMatch(/unsafe/);
      expect(problems).toMatch(/markup or script/);
      expect(problems).toMatch(/contrast/);
      expect(problems).toMatch(/alt text/);
      expect(problems).toMatch(/unknown building block/);
      expect(result).not.toHaveProperty("tree");
    }
    expect(readComposition({ composition: bad })).toBeNull();
  });

  it("runs the truth screen on all text", () => {
    const result = validateComposition(
      { version: 1, root: { type: "text", text: "Award-winning since 1990" } },
      { screenText: (t) => (/award/i.test(t) ? "unsupported award claim" : null) },
    );
    expect(result.ok).toBe(false);
  });

  it("round-trips through section settings without touching other fields", () => {
    const result = validateComposition(novel);
    if (!result.ok) throw new Error("invalid");
    const settings = writeComposition({ effect: "glass" }, result.tree);
    expect(settings["effect"]).toBe("glass");
    expect(readComposition(settings)?.label).toBe("Asymmetric offer lattice");
  });

  it("renders a stored website picture reference through the signed-url resolver", () => {
    const result = validateComposition({ version: 1, root: { type: "media", mediaRef: "11111111-1111-4111-8111-111111111111", alt: "Detailed vehicle" } });
    if (!result.ok) throw new Error("invalid");
    const html = renderToStaticMarkup(createElement(CompositionRenderer, { tree: result.tree, scope: "media", resolveMedia: () => "https://example.com/signed.jpg" }));
    expect(html).toContain('src="https://example.com/signed.jpg"');
  });

  it("the site agent accepts set_composition and reports invalid trees for repair", () => {
    const dropped: string[] = [];
    const known = { pageIds: new Set(["p1"]), sectionIds: new Set(["s1"]), componentIds: new Set<string>() };
    const ok = readActions([{ type: "set_composition", sectionId: "s1", tree: novel }], known, dropped);
    expect(ok).toHaveLength(1);
    expect(ok[0]?.type).toBe("set_composition");
    const bad = readActions([{ type: "set_composition", sectionId: "s1", tree: { version: 1, root: { type: "nope" } } }], known, dropped);
    expect(bad).toHaveLength(0);
    expect(dropped.join(" ")).toMatch(/needs repair/);
  });

  it("reorder, add and delete stay AI-directed with no automatic override", () => {
    const known = { pageIds: new Set(["p1"]), sectionIds: new Set(["a", "b", "c"]), componentIds: new Set<string>() };
    const actions = readActions(
      [
        { type: "reorder_sections", pageId: "p1", sectionIds: ["c", "a", "b"] },
        { type: "delete_section", sectionId: "b" },
      ],
      known,
    );
    const reorder = actions.find((a) => a.type === "reorder_sections") as { sectionIds: string[] } | undefined;
    expect(reorder?.sectionIds).toEqual(["c", "a", "b"]);
    expect(actions.some((a) => a.type === "delete_section")).toBe(true);
  });
});
