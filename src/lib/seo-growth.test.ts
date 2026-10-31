import { describe, expect, it } from "vitest";

import { auditSeo, canonicalFor, seoAuditSummary } from "@/lib/seo-audit";
import { seoOpportunities } from "@/lib/seo-console";
import { internalLinksFor } from "@/lib/seo-links";
import {
  classifyIntent,
  hasIndexableValue,
  indexablePlatformPaths,
  isPrivatePath,
  noindexPlatformPaths,
  seoInventory,
} from "@/lib/seo-intent";

describe("search intent classification", () => {
  it("classifies each public surface by real intent", () => {
    expect(classifyIntent("/")).toBe("brand");
    expect(classifyIntent("/pricing")).toBe("transactional");
    expect(classifyIntent("/get-started")).toBe("transactional");
    expect(classifyIntent("/guides/get-more-google-reviews")).toBe("informational");
    expect(classifyIntent("/local/hvac/texas")).toBe("local");
    expect(classifyIntent("/industries/plumbing")).toBe("industry");
    expect(classifyIntent("/compare/revora-vs-marketing-agency")).toBe("comparison");
    expect(classifyIntent("/crm/electricians")).toBe("commercial");
    expect(classifyIntent("/privacy")).toBe("navigational");
  });
});

describe("thin content gate", () => {
  it("requires substantial unique material to index a page", () => {
    expect(hasIndexableValue({ words: 900, sections: 5, faqs: 5, internalLinks: 4 })).toBe(true);
    expect(hasIndexableValue({ words: 120, sections: 5, faqs: 5, internalLinks: 4 })).toBe(false);
    expect(hasIndexableValue({ words: 900, sections: 1, faqs: 0, internalLinks: 0 })).toBe(false);
  });
});

describe("sitemap inventory", () => {
  const paths = indexablePlatformPaths();

  it("never advertises private surfaces", () => {
    for (const path of paths) expect(isPrivatePath(path || "/")).toBe(false);
  });

  it("excludes demo and share helpers from search", () => {
    const excluded = noindexPlatformPaths();
    expect(excluded).toContain("/share");
    expect(excluded).toContain("/demo");
    expect(excluded).toContain("/demo/dashboard");
    expect(paths).not.toContain("/share");
    expect(paths).not.toContain("/demo/dashboard");
  });

  it("lists every URL exactly once and includes the commercial cluster", () => {
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain("");
    expect(paths).toContain("/pricing");
    expect(paths).toContain("/crm");
    expect(paths).toContain("/crm/electricians");
    expect(paths.length).toBeGreaterThan(100);
  });
});

describe("canonicals", () => {
  it("self-references the Revora domain exactly", () => {
    expect(canonicalFor("/")).toBe("https://revoragrowthsystems.com");
    expect(canonicalFor("/pricing")).toBe("https://revoragrowthsystems.com/pricing");
  });
});

describe("internal linking", () => {
  it("gives descriptive, relevant, non-self links", () => {
    const links = internalLinksFor("/industries/plumbing");
    expect(links.length).toBeGreaterThanOrEqual(3);
    for (const link of links) {
      expect(link.path.startsWith("/")).toBe(true);
      expect(link.anchor.length).toBeGreaterThan(8);
      expect(link.anchor.toLowerCase()).not.toContain("click here");
      expect(link.path).not.toBe("/industries/plumbing");
    }
  });
});

describe("automated SEO audit", () => {
  it("finds no duplicate metadata or thin indexable pages in the live inventory", () => {
    const issues = auditSeo();
    const errors = issues.filter((i) => i.level === "error");
    expect(errors.map((e) => `${e.code} ${e.path}: ${e.detail}`)).toEqual([]);
  });

  it("reports duplicates, thin content and broken links when they exist", () => {
    const issues = auditSeo([
      {
        path: "/a",
        intent: "commercial",
        primaryQuery: "a",
        title: "Same title",
        description: "Same description",
        words: 900,
        indexable: true,
      },
      {
        path: "/b",
        intent: "commercial",
        primaryQuery: "b",
        title: "Same title",
        description: "Same description",
        words: 40,
        indexable: true,
      },
    ]);
    const codes = new Set(issues.map((i) => i.code));
    expect(codes.has("duplicate_title")).toBe(true);
    expect(codes.has("duplicate_description")).toBe(true);
    expect(codes.has("thin_content")).toBe(true);
    expect(codes.has("broken_internal_link")).toBe(true);
  });

  it("summarises counts", () => {
    const summary = seoAuditSummary();
    expect(summary.checkedPages).toBeGreaterThan(100);
    expect(summary.indexablePages).toBeLessThanOrEqual(summary.checkedPages);
    expect(summary.errors).toBe(0);
  });
});

describe("Search Console feedback loop", () => {
  it("returns nothing without usable data", () => {
    expect(seoOpportunities([])).toEqual([]);
    expect(
      seoOpportunities([{ page: "/pricing", clicks: 0, impressions: 0, position: 12 }]),
    ).toEqual([]);
  });

  it("prioritises striking-distance commercial queries", () => {
    const opportunities = seoOpportunities([
      {
        page: "https://revoragrowthsystems.com/crm",
        query: "service business crm",
        clicks: 1,
        impressions: 800,
        position: 9,
      },
      { page: "/privacy", query: "revora privacy", clicks: 0, impressions: 30, position: 40 },
    ]);
    expect(opportunities.length).toBeGreaterThan(0);
    expect(opportunities[0]?.page).toBe("/crm");
    expect(["striking_distance", "high_impressions_low_ctr", "commercial_query"]).toContain(
      opportunities[0]?.kind,
    );
  });

  it("flags declining clicks and growing impressions against the previous period", () => {
    const kinds = seoOpportunities([
      {
        page: "/guides/get-more-google-reviews",
        query: "how to get more google reviews",
        clicks: 4,
        impressions: 500,
        position: 8,
        previous: { clicks: 40, impressions: 300 },
      },
    ]).map((o) => o.kind);
    expect(kinds).toContain("declining_clicks");
    expect(kinds).toContain("growing_impressions");
  });
});

describe("noindex pages and publisher identity", () => {
  it("every inventory noindex page emits the noindex tag", async () => {
    const { readFileSync } = await import("node:fs");
    for (const file of ["share.tsx", "demo.index.tsx", "demo.dashboard.tsx"]) {
      expect(readFileSync(`src/routes/${file}`, "utf8")).toContain('content: "noindex, follow"');
    }
  });

  it("gives Google a large enough logo and business image", async () => {
    const { ORGANIZATION_SCHEMA, LOCAL_BUSINESS_SCHEMA } = await import("@/lib/seo");
    expect(ORGANIZATION_SCHEMA.logo.width).toBeGreaterThanOrEqual(112);
    expect(LOCAL_BUSINESS_SCHEMA.image).toBe("https://revoragrowthsystems.com/og.jpg");
  });

  it("does not claim Revora is open 24/7 (remote business, no opening hours markup)", async () => {
    const { LOCAL_BUSINESS_SCHEMA } = await import("@/lib/seo");
    expect(LOCAL_BUSINESS_SCHEMA).not.toHaveProperty("openingHoursSpecification");
    expect(LOCAL_BUSINESS_SCHEMA).not.toHaveProperty("openingHours");
  });

  it("has no 24/7 hours claim in the organization schema, OG alt text or business identity", async () => {
    const { ORGANIZATION_SCHEMA, OG_IMAGE } = await import("@/lib/seo");
    const { BUSINESS } = await import("@/lib/business-identity");
    expect(JSON.stringify(ORGANIZATION_SCHEMA)).not.toMatch(/hoursAvailable|OpeningHoursSpecification/);
    expect(OG_IMAGE.alt).not.toMatch(/24\/7|24 hours/i);
    expect(BUSINESS).not.toHaveProperty("hours");
  });
});

describe("search snippets are finished text within Google's limits", () => {
  it("compare, CRM and guide pages: title <= 60, description <= 160 and ends cleanly", async () => {
    const { COMPARISONS } = await import("@/lib/compare");
    const { CRM_SOLUTIONS } = await import("@/lib/crm-solutions");
    const { GUIDES } = await import("@/lib/guides");
    const { metaDescription } = await import("@/lib/seo");
    const rows = [
      ...COMPARISONS.map((c) => [c.title, c.description]),
      ...CRM_SOLUTIONS.map((c) => [c.metaTitle, c.description]),
      ...GUIDES.map((c) => [c.metaTitle, c.description]),
    ];
    for (const [title = "", description = ""] of rows) {
      expect(title.length, title).toBeLessThanOrEqual(60);
      const meta = metaDescription(description);
      expect(meta.length, meta).toBeLessThanOrEqual(160);
      expect(meta, meta).toMatch(/[.!?]$/);
    }
  });

  it("metaDescription cuts at a sentence or word boundary and never adds an ellipsis", async () => {
    const { metaDescription } = await import("@/lib/seo");
    const longSentences = "First sentence is here and it is long enough to matter for the budget. Second sentence adds more detail about the offer and the setup fee. Third one runs past the limit entirely.";
    expect(metaDescription(longSentences)).toBe("First sentence is here and it is long enough to matter for the budget. Second sentence adds more detail about the offer and the setup fee.");
    const noPeriods = "word ".repeat(60).trim();
    const cut = metaDescription(noPeriods);
    expect(cut.length).toBeLessThanOrEqual(160);
    expect(cut).not.toContain("…");
    expect(cut).toMatch(/word$/);
  });
});
