import { describe, expect, it } from "vitest";
import { auditSeo } from "@/lib/seo-audit";
import { seoInventory } from "@/lib/seo-intent";
import { internalLinksFor } from "@/lib/seo-links";
import { LOCAL_BUSINESS_SCHEMA, ORGANIZATION_SCHEMA, faqSchema } from "@/lib/seo";

/**
 * Keeps Revora's own search snippets clean: titles and descriptions that fit
 * in a Google result, no orphaned hubs, and the logo/image signals Google
 * uses for the brand in search.
 */
describe("search visibility", () => {
  const inventory = seoInventory();
  const issues = auditSeo(inventory);

  it("has no audit errors", () => {
    expect(issues.filter((issue) => issue.level === "error")).toEqual([]);
  });

  it("fits every indexable title and description inside a search snippet", () => {
    const tooLong = issues.filter(
      (issue) => issue.code === "title_too_long" || issue.code === "description_too_long",
    );
    expect(tooLong).toEqual([]);
  });

  it("links every commercial and local hub from page content, not only the footer", () => {
    const orphans = issues
      .filter((issue) => issue.code === "orphan_page")
      .map((issue) => issue.path)
      // Legal pages are reached from the footer by design.
      .filter((path) => path !== "/privacy" && path !== "/terms");
    expect(orphans).toEqual([]);
    expect(internalLinksFor("/locations/charlotte-nc").map((link) => link.path)).toContain("/states");
  });

  it("gives Google a crawlable logo and a real share image for the brand", () => {
    const logo = (ORGANIZATION_SCHEMA as { logo?: { url?: string } }).logo;
    expect(logo?.url).toBe("https://revoragrowthsystems.com/revora-mark-144.png");
    expect(LOCAL_BUSINESS_SCHEMA.image).toBe("https://revoragrowthsystems.com/og.jpg");
  });

  it("builds FAQPage schema from visible questions", () => {
    const schema = faqSchema([{ q: "Can I cancel?", a: "Any time." }]);
    expect(schema["@type"]).toBe("FAQPage");
    expect(schema.mainEntity[0]).toMatchObject({
      "@type": "Question",
      name: "Can I cancel?",
      acceptedAnswer: { "@type": "Answer", text: "Any time." },
    });
  });
});
