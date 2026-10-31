import { describe, expect, it } from "vitest";
import { PLAYBOOK_CATALOG, type CatalogEntry } from "@/lib/builder/playbook-catalog.generated";
import { type GoldInput, goldPatternIds, goldReferenceBlock, goldReferencesFor } from "@/lib/builder/quality/gold-references";
import { COMPOSITION_PRIMITIVES } from "@/lib/builder/composition-tree";

const input = (e: CatalogEntry): GoldInput => ({
  label: e.label, hero: e.hero, palette: e.palette,
  signatureTool: { name: e.tool.name, mode: e.tool.mode, inputs: e.tool.inputs }, ownerKeys: e.tool.ownerKeys,
});
const bySlug = (slug: string) => {
  const entry = PLAYBOOK_CATALOG.find((e) => e.slug === slug) ?? PLAYBOOK_CATALOG[0];
  if (!entry) throw new Error("playbook catalog is empty");
  return input(entry);
};

const FACT_SHAPES = [/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/, /\$\s?\d/, /\b\d(?:\.\d)?\s?(?:stars?|\/5)\b/i, /\b\d{2,}\s+(?:reviews|years)\b/i, /\baward[- ]winning\b/i, /@[\w-]+\.\w+/];

describe("gold references", () => {
  it("gives every catalog trade 2 or 3 references", () => {
    for (const e of PLAYBOOK_CATALOG) {
      const refs = goldReferencesFor(input(e));
      expect(refs.length, e.slug).toBeGreaterThanOrEqual(2);
      expect(refs.length, e.slug).toBeLessThanOrEqual(3);
      expect(new Set(refs.map((r) => r.id)).size).toBe(refs.length);
    }
  });

  it("always opens with the cinematic scrub opening", () => {
    expect(goldPatternIds({ signatureTool: { mode: "anything" } as never })[0]).toBe("scrub-opening");
  });

  it("only uses real composition primitives", () => {
    const known = new Set<string>(COMPOSITION_PRIMITIVES);
    for (const e of PLAYBOOK_CATALOG) {
      for (const r of goldReferencesFor(input(e))) for (const s of r.sections) expect(known.has(s.primitive), `${e.slug} ${s.primitive}`).toBe(true);
    }
  });

  it("states what to do when owner material is missing, in every section", () => {
    for (const r of goldReferencesFor(bySlug("roofing"))) for (const s of r.sections) expect(s.whenMissing.length).toBeGreaterThan(10);
  });

  it("contains no invented facts in any prompt block", () => {
    for (const e of PLAYBOOK_CATALOG) {
      const text = goldReferenceBlock(goldReferencesFor(input(e)));
      for (const re of FACT_SHAPES) expect(re.test(text), `${e.slug} ${re}`).toBe(false);
    }
  });

  it("falls back to references for an unknown trade", () => {
    expect(goldReferencesFor({ ...bySlug("roofing"), signatureTool: { name: "x", mode: "never-seen", inputs: [] } }).length).toBeGreaterThanOrEqual(2);
  });

  it("is deterministic", () => {
    const a = goldReferenceBlock(goldReferencesFor(bySlug("plumbing")));
    expect(goldReferenceBlock(goldReferencesFor(bySlug("plumbing")))).toBe(a);
  });
});
