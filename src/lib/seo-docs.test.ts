import { describe, expect, it } from "vitest";

import { COMPARE_INDEX, COMPARISONS, findComparison } from "@/lib/compare";
import { COMPARE_DOCS, extractFaqs, parseSeoDoc, plainText, publishAtFromTarget } from "@/lib/seo-docs";
import { seoInventory } from "@/lib/seo-intent";

describe("seo-docs parsing", () => {
  const raw = [
    "---",
    "url: /compare/x",
    "title_tag (12 chars): A title",
    "meta_description: A meta.",
    "h1: The H1",
    "---",
    "",
    "# The H1",
    "",
    "Intro **bold** text.",
    "",
    "## Common questions",
    "",
    "**Is it [good](/x)?** Yes, **really**.",
    "",
    "**Second?** Maybe.",
    "",
    "---",
    "",
    "**Notes (not for publishing)**",
    "- internal only",
  ].join("\n");

  it("reads frontmatter, drops the H1 and the publishing notes", () => {
    const doc = parseSeoDoc("compare", "x", raw);
    expect(doc).toMatchObject({ path: "/compare/x", title: "A title", description: "A meta.", h1: "The H1", slug: "x" });
    expect(doc.body).not.toContain("Notes (not for publishing)");
    expect(doc.body).not.toContain("internal only");
    expect(doc.body.startsWith("Intro")).toBe(true);
  });

  it("extracts FAQs as the plain text a visitor reads", () => {
    expect(extractFaqs(parseSeoDoc("compare", "x", raw).body)).toEqual([
      { q: "Is it good?", a: "Yes, really." },
      { q: "Second?", a: "Maybe." },
    ]);
  });

  it("turns a target date into midnight Eastern", () => {
    expect(publishAtFromTarget("Mon Nov 9, 2026")).toBe("2026-11-09T00:00:00-05:00");
    expect(publishAtFromTarget(undefined)).toBeNull();
  });
});

describe("published comparison pages", () => {
  it("has the six comparisons and the index", () => {
    expect(COMPARISONS.map((c) => c.slug)).toEqual([
      "revora-vs-marketing-agency",
      "revora-vs-diy-website-builder",
      "revora-vs-wix",
      "revora-vs-squarespace",
      "revora-vs-buying-leads",
      "revora-vs-hiring-office-help",
    ]);
    expect(COMPARE_INDEX.path).toBe("/compare");
    expect(findComparison("revora-vs-wix")?.heading).toBe("Revora vs Wix");
  });

  it.each(COMPARE_DOCS.map((d) => [d.file, d] as const))("%s publishes only the page body", (_file, doc) => {
    expect(doc.title).not.toBe("");
    expect(doc.title.length).toBeLessThanOrEqual(60);
    expect(doc.description.length).toBeLessThanOrEqual(160);
    expect(doc.h1).not.toBe("");
    expect(doc.body).not.toMatch(/Notes \(not for publishing\)|DRAFT|\{\{|---\s*$/m);
    expect(doc.body).not.toMatch(/^#\s/m);
  });

  it.each(COMPARISONS.map((c) => [c.slug, c] as const))("%s FAQ schema text is visible in the page", (_slug, c) => {
    expect(c.faqs.length).toBeGreaterThanOrEqual(3);
    const visible = plainText(c.body);
    for (const f of c.faqs) {
      expect(visible).toContain(f.q);
      expect(visible).toContain(f.a);
    }
  });

  it("states the Revora offer as it is, with no guarantee or refund wording", () => {
    for (const c of COMPARISONS) {
      // Competitors' own terms may be quoted; Revora's may not be embellished.
      expect(c.body).not.toMatch(/Revora[^.|\n]*(month-to-month|refund|guarantee)/i);
      expect(c.body).not.toMatch(/\(\d{3}\)\s?\d{3}-\d{4}|24\/7|24 hours|round-the-clock/i);
    }
  });

  it("puts every comparison page in the sitemap inventory", () => {
    const paths = seoInventory().filter((p) => p.indexable).map((p) => p.path);
    for (const c of COMPARISONS) expect(paths).toContain(`/compare/${c.slug}`);
  });
});
