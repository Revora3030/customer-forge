import { describe, expect, it } from "vitest";
import {
  GROWTH_SYSTEM_SCHEMA,
  LOCAL_BUSINESS_SCHEMA,
  ORGANIZATION_SAME_AS,
  ORGANIZATION_SCHEMA,
  SITE_URL,
  WEBSITE_SCHEMA,
  breadcrumbSchema,
  faqPageSchema,
} from "@/lib/seo";
import { REVORA } from "@/lib/brand";
import { Route as AboutRoute } from "@/routes/about";
import { Route as ContactRoute } from "@/routes/contact";
import { Route as CrmContractorsRoute } from "@/routes/crm-for-contractors";
import { Route as GetStartedRoute } from "@/routes/get-started";
import { Route as GrowthAssessmentRoute } from "@/routes/growth-assessment";
import { Route as GuideRoute } from "@/routes/guides.$slug";
import { Route as IndustriesIndexRoute } from "@/routes/industries.index";
import { Route as PricingRoute } from "@/routes/pricing";
import { Route as PrivacyRoute } from "@/routes/privacy";
import { Route as TermsRoute } from "@/routes/terms";
import { Route as WebsiteAuditRoute } from "@/routes/website-audit";
import { GUIDES } from "@/lib/guides";

type Script = { type?: string; children?: string };
type Head = { scripts?: Script[] };
const headOf = (route: unknown, args: unknown = {}): Head =>
  (route as { options: { head: (a: unknown) => Head } }).options.head(args);
const blocks = (head: Head): Array<Record<string, unknown>> =>
  (head.scripts ?? [])
    .filter((s) => s.type === "application/ld+json")
    .map((s) => JSON.parse(s.children ?? "{}") as Record<string, unknown>);
const typesOf = (b: Record<string, unknown>) => ([] as unknown[]).concat(b["@type"]);

describe("sitewide Organization and WebSite", () => {
  it("names the company, has a logo, and carries no phone, address or hours", () => {
    const org = ORGANIZATION_SCHEMA as Record<string, unknown>;
    expect(org["@type"]).toBe("Organization");
    expect(org["name"]).toBe("Revora Growth Systems");
    expect(org["url"]).toBe(SITE_URL);
    expect(org["logo"]).toBeTruthy();
    expect(org).not.toHaveProperty("telephone");
    expect(org).not.toHaveProperty("address");
    expect(org).not.toHaveProperty("openingHoursSpecification");
    const json = JSON.stringify(org);
    expect(json).not.toContain(REVORA.phone);
    expect(json).not.toContain(REVORA.phoneDisplay);
    expect(json).not.toMatch(/telephone|streetAddress/);
  });

  it("only emits sameAs for real https profile URLs", () => {
    const org = ORGANIZATION_SCHEMA as Record<string, unknown>;
    if (ORGANIZATION_SAME_AS.length === 0) expect(org).not.toHaveProperty("sameAs");
    else expect(org["sameAs"]).toEqual([...ORGANIZATION_SAME_AS]);
    for (const url of ORGANIZATION_SAME_AS) expect(url).toMatch(/^https:\/\//);
  });

  it("publishes the WebSite entity for this site", () => {
    expect(WEBSITE_SCHEMA["@type"]).toBe("WebSite");
    expect(WEBSITE_SCHEMA.url).toBe(SITE_URL);
    expect(WEBSITE_SCHEMA.publisher["@id"]).toBe(`${SITE_URL}/#organization`);
  });
});

describe("no unbacked claims in any shared schema", () => {
  const all = JSON.stringify([ORGANIZATION_SCHEMA, WEBSITE_SCHEMA, LOCAL_BUSINESS_SCHEMA, GROWTH_SYSTEM_SCHEMA]);
  it("has no ratings, reviews, awards, 24/7 or phone numbers", () => {
    expect(all).not.toMatch(/aggregateRating|"Review"|reviewCount|ratingValue|"award"/);
    expect(all).not.toMatch(/24\s*\/\s*7|24 hours|hoursAvailable|openingHours/i);
    expect(all).not.toContain(REVORA.phone);
    expect(all).not.toMatch(/telephone/);
  });
});

describe("/pricing schema", () => {
  it("states exactly $350 setup, first month free, then $100/month, matching the visible page", () => {
    const g = GROWTH_SYSTEM_SCHEMA;
    expect(typesOf(g as unknown as Record<string, unknown>)).toEqual(["Service", "SoftwareApplication"]);
    expect(g.applicationCategory).toBe("BusinessApplication");
    const [setup, free, monthly] = g.offers;
    expect(setup).toMatchObject({ price: 350, priceCurrency: "USD" });
    expect(free).toMatchObject({ price: 0, priceCurrency: "USD", name: "First month free" });
    expect(monthly?.priceSpecification).toMatchObject({ price: 100, priceCurrency: "USD", unitText: "MONTH" });
    expect(g.offers).toHaveLength(3);
  });

  it("ships the plan, a breadcrumb and the visible FAQ as separate valid blocks", () => {
    const b = blocks(headOf(PricingRoute, { loaderData: null }));
    const kinds = b.flatMap(typesOf);
    expect(kinds).toEqual(expect.arrayContaining(["Service", "SoftwareApplication", "BreadcrumbList", "FAQPage"]));
  });
});

describe("breadcrumbs", () => {
  it("builds ordered ListItems with absolute URLs", () => {
    const bc = breadcrumbSchema([
      { name: "Revora", path: "/" },
      { name: "Guides", path: "/guides" },
    ]);
    expect(bc.itemListElement.map((i) => i.position)).toEqual([1, 2]);
    expect(bc.itemListElement[1]?.item).toBe(`${SITE_URL}/guides`);
  });

  const pages: Array<[string, unknown, unknown, string]> = [
    ["/get-started", GetStartedRoute, {}, "Get started"],
    ["/website-audit", WebsiteAuditRoute, {}, "Free website audit"],
    ["/growth-assessment", GrowthAssessmentRoute, {}, "Free growth assessment"],
    ["/contact", ContactRoute, { loaderData: null }, "Contact"],
    ["/privacy", PrivacyRoute, {}, "Privacy policy"],
    ["/terms", TermsRoute, {}, "Terms of service"],
    ["/industries", IndustriesIndexRoute, {}, "Industries"],
    ["/crm-for-contractors", CrmContractorsRoute, {}, "CRM for contractors"],
    ["/about", AboutRoute, {}, "About"],
  ];
  it.each(pages)("%s has a BreadcrumbList that ends at its own URL", (path, route, args, label) => {
    const bc = blocks(headOf(route, args)).find((b) => b["@type"] === "BreadcrumbList");
    expect(bc, `${path} breadcrumb`).toBeTruthy();
    const items = bc!["itemListElement"] as Array<{ position: number; name: string; item: string }>;
    expect(items.at(-1)?.item).toBe(`${SITE_URL}${path}`);
    expect(items.at(-1)?.name).toBe(label);
    expect(items[0]?.item).toBe(SITE_URL);
  });
});

describe("guide Article schema", () => {
  it.each(GUIDES.map((g) => [g.slug, g] as const))("%s uses the guide's real dates and the Organization as author", (_slug, guide) => {
    const b = blocks(
      headOf(GuideRoute, { params: { slug: guide.slug }, match: { context: { guide } }, loaderData: { guide } }),
    );
    const article = b.find((x) => x["@type"] === "Article") as Record<string, unknown> | undefined;
    expect(article).toBeTruthy();
    expect(article!["datePublished"]).toBe(guide.published);
    expect(article!["dateModified"]).toBe(guide.updated);
    expect(article!["author"]).toMatchObject({ "@type": "Organization", name: "Revora Growth Systems" });
    expect(article!["datePublished"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(JSON.stringify(article)).not.toMatch(/aggregateRating|"@type":"Review"/);
  });
});

describe("FAQPage", () => {
  it("mirrors the list it is given, nothing more", () => {
    const f = faqPageSchema([{ q: "Q?", a: "A." }]);
    expect(f.mainEntity).toEqual([{ "@type": "Question", name: "Q?", acceptedAnswer: { "@type": "Answer", text: "A." } }]);
  });
});
