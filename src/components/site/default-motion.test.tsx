import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompositionRenderer } from "./CompositionRenderer";
import type { CompositionNode, CompositionTree } from "@/lib/builder/composition-tree";

const render = (root: CompositionNode, scope = "s-test") =>
  renderToStaticMarkup(<CompositionRenderer tree={{ version: 1, root } as CompositionTree} scope={scope} />);
const markup = (html: string) => html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");
const card = (t: string): CompositionNode => ({ type: "card", children: [{ type: "heading", level: 3, text: t }] });
const section: CompositionNode = {
  type: "stack",
  children: [
    { type: "heading", level: 2, text: "Services" },
    { type: "grid", children: [card("One"), card("Two"), card("Three")] },
  ],
};

describe("default scroll reveal", () => {
  it("reveals grid items with a stagger and leaves headings alone", () => {
    const html = markup(render(section));
    expect(html.match(/rv-cn-auto/g)).toHaveLength(3);
    expect(html).toContain("--rv-i:1");
    expect(html).toContain("--rv-i:2");
    expect(html).not.toMatch(/<h2[^>]*rv-cn-auto/);
  });

  it("keeps the AI's own motion instead of the default", () => {
    const html = markup(render({ type: "stack", children: [{ type: "grid", children: [{ ...card("A"), motion: { kind: "scale" } as never }] }] }));
    expect(html).not.toContain("rv-cn-auto");
    expect(html).toContain('data-motion="scale"');
  });

  it("is view-timeline only and off for reduced-motion visitors", () => {
    const css = render(section);
    expect(css).toContain("@supports (animation-timeline:view()){@media (prefers-reduced-motion:no-preference){.rv-cn-auto{");
  });
});
