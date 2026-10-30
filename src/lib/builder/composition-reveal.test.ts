import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CompositionRenderer } from "@/components/site/CompositionRenderer";
import { validateComposition, type CompositionTree } from "./composition-tree";

const brush = (extra: Record<string, unknown> = {}) => ({
  version: 1,
  root: {
    type: "before_after_slider",
    revealMode: "brush",
    text: "Clean this driveway",
    beforeImage: { mediaRef: "temp_before", alt: "Driveway with black streaks", label: "Before" },
    afterImage: { mediaRef: "temp_after", alt: "The same driveway, clean", label: "After" },
    ...extra,
  },
});
const draw = (tree: CompositionTree, source: string) =>
  renderToStaticMarkup(
    createElement(CompositionRenderer, { tree, scope: "proof", as: "div", resolveMedia: ((ref: string) => ({ url: `https://cdn.example/${ref}.jpg`, visual: { source } })) as never }),
  );

describe("brush reveal on a before/after pair", () => {
  it("accepts revealMode brush or slider and nothing else", () => {
    expect(validateComposition(brush()).ok).toBe(true);
    expect(validateComposition(brush({ revealMode: "slider" })).ok).toBe(true);
    expect(validateComposition(brush({ revealMode: "spray" })).ok).toBe(false);
  });
  it("refuses revealMode on any other node", () => {
    const text = { version: 1, root: { type: "text", text: "Hi", revealMode: "brush" } };
    expect(validateComposition(text).ok).toBe(false);
  });
  it("renders the prompt, the percentage readout and a button that shows the finished result", () => {
    const html = draw(brush() as CompositionTree, "owner");
    expect(html).toContain("Clean this driveway");
    expect(html).toContain("Drag across the picture");
    expect(html).toContain("Show finished result");
    expect(html).toContain("temp_before.jpg");
    // Finished picture is in the page for no-JavaScript visitors.
    expect(html).toContain("<noscript>");
    expect(html).toContain("temp_after.jpg");
  });
  it("keeps the owner-photos-only rule: a generated picture on either side renders nothing", () => {
    expect(draw(brush() as CompositionTree, "generated")).not.toContain("<img");
  });
  it("leaves the normal slider alone when no mode is set", () => {
    const plain = brush();
    delete (plain.root as Record<string, unknown>)["revealMode"];
    const html = draw(plain as CompositionTree, "owner");
    expect(html).toContain('role="slider"');
    expect(html).not.toContain("Show finished result");
  });
});
