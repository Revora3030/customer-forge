import { describe, expect, it } from "vitest";
import { readComposition, validateComposition } from "./composition-tree";

const tree = (style: Record<string, unknown>, type = "text") => ({
  version: 1,
  root: { type: "stack", children: [{ type, text: "Hello", style }] },
});

describe("composition render safety", () => {
  it("still renders a saved section with a quality finding (low contrast)", () => {
    const settings = { composition: tree({ color: "#777777", background: "#888888" }) };
    expect(readComposition(settings)).not.toBeNull();
  });
  it("generation stays strict so the AI repairs the finding", () => {
    expect(validateComposition(tree({ color: "#777777", background: "#888888" })).ok).toBe(false);
  });
  it("never renders unsafe content", () => {
    const settings = { composition: { version: 1, root: { type: "text", text: "<script>alert(1)</script>" } } };
    expect(readComposition(settings)).toBeNull();
    const bad = { composition: { version: 1, root: { type: "link", text: "x", href: "javascript:alert(1)" } } };
    expect(readComposition(bad)).toBeNull();
  });
  it("accepts 3:1 contrast for large headings (WCAG large text)", () => {
    const heading = tree({ color: "#949494", background: "#ffffff", size: 48 }, "heading");
    expect(validateComposition(heading).ok).toBe(true);
    const small = tree({ color: "#949494", background: "#ffffff", size: 14 });
    expect(validateComposition(small).ok).toBe(false);
  });
});
