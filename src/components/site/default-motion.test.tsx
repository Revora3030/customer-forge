import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompositionRenderer } from "./CompositionRenderer";
import type { CompositionNode, CompositionTree } from "@/lib/builder/composition-tree";

const render = (root: CompositionNode, scope = "s-test") =>
  renderToStaticMarkup(<CompositionRenderer tree={{ version: 1, root } as CompositionTree} scope={scope} />);
// Drops the renderer's <style> blocks so assertions only see element markup
// (test-only text slicing, never used to sanitise HTML).
const markup = (html: string) => {
  let out = "";
  let at = 0;
  for (;;) {
    const open = html.indexOf("<style", at);
    if (open < 0) return out + html.slice(at);
    out += html.slice(at, open);
    const close = html.indexOf("</style>", open);
    if (close < 0) return out;
    at = close + "</style>".length;
  }
};
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

describe("Ken Burns hero fallback", () => {
  const ref = "00000001-1111-4111-8111-111111111111";
  const scene: CompositionNode = { type: "scene", children: [{ type: "media", mediaRef: ref, alt: "Clean driveway" }, { type: "heading", level: 1, text: "Clean" }] };
  it("gives the opening still picture a slow reduced-motion-safe drift", () => {
    const html = renderToStaticMarkup(
      <CompositionRenderer tree={{ version: 1, root: scene } as CompositionTree} scope="s-k" resolveMedia={() => ({ url: "https://img.example.test/a.jpg" }) as never} />,
    );
    expect(markup(html)).toMatch(/<img[^>]*data-kenburns=""/);
    expect(html).toContain("@media (prefers-reduced-motion:no-preference){img.rv-scene-media[data-kenburns]");
  });
  it("leaves a video backdrop as video", () => {
    const html = markup(renderToStaticMarkup(
      <CompositionRenderer tree={{ version: 1, root: scene } as CompositionTree} scope="s-k" resolveMedia={() => ({ url: "https://img.example.test/a.mp4" }) as never} />,
    ));
    expect(html).toContain("<video");
    expect(html).not.toContain("data-kenburns");
  });
});
