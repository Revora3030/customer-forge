import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompositionRenderer, SELF_REVEAL_TYPES } from "@/components/site/CompositionRenderer";
import { validateComposition } from "@/lib/builder/composition-tree";

const render = (child: unknown) => {
  const result = validateComposition({ version: 1, root: { type: "stack", children: [{ type: "heading", level: 2, text: "Section" }, child] } }, { allowedMediaRefs: new Set() });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return renderToStaticMarkup(<CompositionRenderer tree={result.tree} scope="t" resolveWidget={(name) => <span>{name}</span>} />).replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");
};

describe("scroll reveal on stand-alone content blocks", () => {
  it("covers lists, FAQs and widgets", () => {
    expect([...SELF_REVEAL_TYPES].sort()).toEqual(["faq_accordion", "list", "widget"]);
  });

  it("a list or widget section outside a grid still rises in", () => {
    expect(render({ type: "list", items: ["One", "Two"] })).toMatch(/<ul[^>]*class="[^"]*rv-cn-auto/);
    expect(render({ type: "widget", text: "review_wall" })).toMatch(/data-widget="review_wall"/);
    expect(render({ type: "widget", text: "review_wall" })).toMatch(/class="[^"]*rv-cn-auto[^"]*"[^>]*data-widget|data-widget[^>]*class="[^"]*rv-cn-auto/);
  });

  it("headings are not auto-revealed (unchanged)", () => {
    expect(render({ type: "list", items: ["One"] })).not.toMatch(/<h2[^>]*rv-cn-auto/);
  });
});
