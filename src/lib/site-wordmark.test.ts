import { describe, expect, it } from "vitest";
import type { CompositionTree } from "@/lib/builder/composition-tree";
import {
  WORDMARK_SHAPES,
  cleanBusinessName,
  hashName,
  wordmarkInitials,
  wordmarkLines,
  wordmarkShape,
  withoutBrandText,
} from "@/lib/site-wordmark";

describe("wordmarkInitials", () => {
  it("takes the first letters of the first two significant words", () => {
    expect(wordmarkInitials("Elite Mobile Detailing")).toBe("EM");
    expect(wordmarkInitials("Harbor Line Plumbing LLC")).toBe("HL");
    expect(wordmarkInitials("The House of Roofing")).toBe("HR");
  });
  it("uses one letter for a one-word name and never returns empty", () => {
    expect(wordmarkInitials("Acme")).toBe("A");
    expect(wordmarkInitials("")).toBe("•");
    expect(wordmarkInitials(null)).toBe("•");
    expect(wordmarkInitials("!!! ???")).toBe("•");
  });
  it("handles accents and non-latin letters", () => {
    expect(wordmarkInitials("élan café")).toBe("ÉC");
    expect(wordmarkInitials("東京 工務店")).toBe("東工");
  });
});

describe("wordmarkLines", () => {
  it("keeps a short name on one line", () => {
    expect(wordmarkLines("Harbor Line")).toEqual({ lines: ["Harbor Line"], fontSize: 18 });
  });
  it("splits a long name into two balanced lines at a word boundary", () => {
    const { lines, fontSize } = wordmarkLines("Elite Mobile Detailing and Ceramic Coating");
    expect(lines).toHaveLength(2);
    expect(fontSize).toBe(14);
    expect(lines.join(" ")).toBe("Elite Mobile Detailing and Ceramic Coating");
  });
  it("truncates absurdly long names and single long words", () => {
    const huge = wordmarkLines("A".repeat(200));
    expect(huge.lines).toHaveLength(1);
    expect(Array.from(huge.lines[0]!).length).toBeLessThanOrEqual(24);
    const many = wordmarkLines(Array.from({ length: 30 }, (_, i) => `word${i}`).join(" "));
    expect(many.lines.every((l) => Array.from(l).length <= 24)).toBe(true);
    expect(many.lines.join(" ").endsWith("…")).toBe(true);
  });
  it("falls back to a neutral label when the name is empty", () => {
    expect(wordmarkLines("   ").lines).toEqual(["Business"]);
  });
});

describe("determinism and shape", () => {
  it("returns the same hash and shape every time, ignoring case and legal suffix", () => {
    expect(hashName("Acme")).toBe(hashName("acme"));
    expect(wordmarkShape("Acme Roofing LLC", "roofing")).toBe(wordmarkShape("acme roofing", "roofing"));
    expect(wordmarkShape("Acme Roofing", "roofing")).toBe(wordmarkShape("Acme Roofing", "roofing"));
  });
  it("picks only from the trade's pool and always a known shape", () => {
    for (const name of ["A", "Bravo", "Charlie Co", "Delta Air", "Echo Services"]) {
      expect(["shield", "arch", "rounded"]).toContain(wordmarkShape(name, "Roofing"));
      expect(Object.keys(WORDMARK_SHAPES)).toContain(wordmarkShape(name, null));
    }
  });
  it("varies across names", () => {
    const shapes = new Set(Array.from({ length: 40 }, (_, i) => wordmarkShape(`Business ${i}`)));
    expect(shapes.size).toBeGreaterThan(2);
  });
});

describe("cleanBusinessName", () => {
  it("collapses whitespace, strips control characters and legal suffixes", () => {
    expect(cleanBusinessName("  Bob's \n\t Plumbing,  Inc. ")).toBe("Bob's Plumbing");
    expect(cleanBusinessName("A\u0000B")).toBe("A B");
  });
});

describe("withoutBrandText", () => {
  const node = (type: "text" | "link" | "stack" | "row", extra: Record<string, unknown> = {}) => ({ type, ...extra }) as never;
  const tree = (children: unknown[]): CompositionTree => ({ version: 1, root: node("row", { children }) });
  it("removes the first plain-text copy of the business name only", () => {
    const t = tree([node("text", { text: "Acme Plumbing" }), node("link", { text: "Services", href: "/services" }), node("text", { text: "Acme Plumbing" })]);
    const out = withoutBrandText(t, "Acme Plumbing, LLC");
    expect(out.root.children).toHaveLength(2);
    expect(out.root.children![0]!.text).toBe("Services");
    expect(t.root.children).toHaveLength(3);
  });
  it("returns the same tree when the name is not present", () => {
    const t = tree([node("link", { text: "Services", href: "/services" })]);
    expect(withoutBrandText(t, "Acme")).toBe(t);
  });
});
