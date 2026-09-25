import { describe, expect, it } from "vitest";
import { validateComposition } from "./composition-tree";

const m = (src: string) => ({ type: "media", src, alt: "photo" });
const tree = (root: unknown) => ({ version: 1, root });

describe("interactive building blocks", () => {
  it("accepts valid tabs, accordion, compare, gallery, marquee, quote", () => {
    const r = validateComposition(tree({ type: "stack", children: [
      { type: "tabs", children: [{ type: "stack", text: "A", children: [{ type: "text", text: "x" }] }] },
      { type: "accordion", children: [{ type: "card", text: "Q?", children: [{ type: "text", text: "A" }] }] },
      { type: "compare", children: [m("https://a.test/1.jpg"), m("https://a.test/2.jpg")] },
      { type: "gallery", children: [m("https://a.test/3.jpg")] },
      { type: "marquee", children: [{ type: "text", text: "Detailing" }] },
      { type: "quote", text: "Real words", items: ["Owner"] },
    ] }));
    expect(r.ok).toBe(true);
  });
  it("rejects malformed blocks with repairable issues", () => {
    const r = validateComposition(tree({ type: "stack", children: [
      { type: "compare", children: [m("https://a.test/1.jpg")] },
      { type: "tabs", children: [{ type: "stack" }] },
      { type: "gallery", children: [{ type: "text", text: "no" }] },
      { type: "quote" },
    ] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.length).toBeGreaterThanOrEqual(4);
  });
});
