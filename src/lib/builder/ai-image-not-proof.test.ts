import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { CompositionRenderer } from "@/components/site/CompositionRenderer";
import type { CompositionTree } from "@/lib/builder/composition-tree";

const compareTree: CompositionTree = {
  version: 1,
  label: "Results",
  root: {
    type: "compare",
    children: [
      { type: "media", mediaRef: "before", alt: "Seat before cleaning", text: "Before" },
      { type: "media", mediaRef: "after", alt: "Seat after cleaning", text: "After" },
    ],
  },
} as never;

const render = (source: "generated" | "customer") =>
  renderToStaticMarkup(
    createElement(CompositionRenderer, {
      tree: compareTree,
      scope: "proof",
      resolveMedia: (ref: string) => ({ url: `https://example.com/${ref}.jpg`, visual: { source } }),
    }),
  );

describe("AI_GENERATED_DRAFT pictures are never shown as before/after proof", () => {
  it("drops a compare block built from AI-generated pictures", () => {
    const html = render("generated");
    expect(html).not.toContain("before.jpg");
    expect(html).not.toContain("after.jpg");
  });

  it("still shows a compare block built from the owner's own photos", () => {
    const html = render("customer");
    expect(html).toContain("before.jpg");
    expect(html).toContain("after.jpg");
  });

  it("tells the designer which pictures are AI-made and forbids using them as proof", () => {
    const src = readFileSync("src/lib/builder/first-build-compositions.server.ts", "utf8");
    expect(src).toContain("aiGenerated: true");
    expect(src).toContain("never place them in a compare or before_after_slider");
  });
});
