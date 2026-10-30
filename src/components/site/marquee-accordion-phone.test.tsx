import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompositionRenderer } from "./CompositionRenderer";
import type { CompositionNode, CompositionTree } from "@/lib/builder/composition-tree";

const tree = (root: CompositionNode) => ({ version: 1, root }) as CompositionTree;
const render = (root: CompositionNode) =>
  renderToStaticMarkup(<CompositionRenderer tree={tree(root)} scope="mq" />);

describe("marquee keeps its max-content track under the phone-safety guard", () => {
  const html = render({
    type: "marquee",
    children: ["Trusted partner", "Licensed and insured", "Same-day quotes"].map((text) => ({ type: "text", text })),
  });

  it("renders the track and its inert duplicate", () => {
    expect(html).toContain('class="rv-cn-marquee"');
    expect(html).toContain("width:max-content");
    expect(html).toMatch(/aria-hidden="true"[^>]*inert/);
  });

  it("ships CSS that beats the [data-composition] * max-width:100% cap and stops item shrink", () => {
    // The guard is `[data-composition][data-composition] *{min-width:0;max-width:100%}`
    // (specificity 0,2,0); the marquee rules must be more specific.
    expect(html).toContain("[data-composition][data-composition] *{box-sizing:border-box;min-width:0;max-width:100%");
    expect(html).toContain("[data-composition][data-composition] .rv-cn-marquee,[data-composition][data-composition] .rv-cn-marquee>[aria-hidden]{max-width:none;flex-wrap:nowrap}");
    expect(html).toContain("[data-composition][data-composition] .rv-cn-marquee>*,[data-composition][data-composition] .rv-cn-marquee>[aria-hidden]>*{flex-shrink:0}");
    // The scroll animation and reduced-motion opt-out are unchanged.
    expect(html).toContain("@media (prefers-reduced-motion: no-preference){.rv-cn-marquee{animation:rv-cn-marquee 30s linear infinite}}");
  });
});

describe("accordion question text can wrap inside its flex summary", () => {
  it("wraps the question in a shrinkable span so long words never overflow the phone", () => {
    const long = "Supercalifragilisticexpialidociousprofessionalpressurewashing";
    const html = render({
      type: "accordion",
      children: [{ type: "stack", text: `How long does it take? ${long}`, children: [{ type: "text", text: "About two hours." }] }],
    });
    expect(html).toMatch(/<summary style="[^"]*display:flex[^"]*"><span style="min-width:0;overflow-wrap:anywhere">How long does it take\? Supercali/);
    expect(html).toContain("About two hours.");
  });
});
