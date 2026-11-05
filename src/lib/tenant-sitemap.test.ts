/**
 * Sitemaps for client sites on the platform address (/s/<slug>): only
 * published, live-allowed sites; only visible, indexable, populated pages;
 * publish-time lastmod everywhere; a verified custom domain owns its own.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const db: { tables: Record<string, Row[]>; failTable: string | undefined } = { tables: {}, failTable: undefined };

function fakeClient() {
  return {
    from(table: string) {
      const filters: ((row: Row) => boolean)[] = [];
      let notNull: string | null = null;
      let bounds: [number, number] | null = null;
      const rows = () =>
        (db.tables[table] ?? []).filter(
          (row) => filters.every((filter) => filter(row)) && (!notNull || row[notNull] != null),
        );
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          if (column === "pages->>live_format") filters.push((row) => String((row["pages"] as Row | null)?.["live_format"]) === value);
          else filters.push((row) => row[column] === value);
          return chain;
        },
        in: (column: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[column]));
          return chain;
        },
        not: (column: string) => {
          notNull = column;
          return chain;
        },
        order: () => chain,
        range: (from: number, to: number) => { bounds = [from, to]; return chain; },
        limit: () => chain,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (value: { data: Row[] | null; error: { message: string } | null }) => unknown) => resolve(db.failTable === table ? { data: null, error: { message: "offline" } } : { data: bounds ? rows().slice(bounds[0], bounds[1] + 1) : rows(), error: null }),
      };
      return chain;
    },
  };
}

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: fakeClient() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => fakeClient() }));

import { hostTenantFactsResponse, platformSitemapSlugs, platformTenantFactsResponse, platformTenantRobotsResponse, platformTenantSitemapResponse, sitemapUrls, xmlSitemapIndex } from "./site-host.server";

const ORG = "11111111-1111-4111-8111-111111111111";
const TRIAL = "22222222-2222-4222-8222-222222222222";
const DOMAIN = "33333333-3333-4333-8333-333333333333";
const DRAFT = "44444444-4444-4444-8444-444444444444";
const PUBLISHED_AT = "2026-10-10T12:00:00.000Z";

const section = (visible = true) => ({ id: `s-${Math.random()}`, is_visible: visible, components: [] });
const livePages = [
  { id: "h", slug: "home", kind: "home", sort_order: 0, is_visible: true, sections: [section()] },
  { id: "a", slug: "services", kind: "page", sort_order: 1, is_visible: true, sections: [section()] },
  { id: "b", slug: "hidden", kind: "page", sort_order: 2, is_visible: false, sections: [section()] },
  { id: "c", slug: "thanks", kind: "thanks", sort_order: 3, is_visible: true, sections: [section()] },
  { id: "d", slug: "private", kind: "page", sort_order: 4, is_visible: true, noindex: true, sections: [section()] },
  { id: "e", slug: "empty", kind: "page", sort_order: 5, is_visible: true, sections: [section(false)] },
  { id: "f", slug: "about", kind: "page", sort_order: 6, is_visible: true, sections: [section()] },
];

const org = (id: string, slug: string, over: Row = {}) => ({
  id,
  slug,
  name: slug,
  industry: null,
  is_demo: false,
  is_suspended: false,
  setup_paid_at: null,
  setup_payment_status: "paid",
  trial_ends_at: null,
  created_at: "2026-01-01T00:00:00Z",
  subscription_status: null,
  ...over,
});

beforeEach(() => {
  db.failTable = undefined;
  db.tables = {
    organizations: [
      org(ORG, "acme"),
      // Trial ended without the setup payment: the site is offline.
      org(TRIAL, "lapsed", { setup_payment_status: null, trial_ends_at: "2026-02-01T00:00:00Z" }),
      org(DOMAIN, "owned"),
      org(DRAFT, "drafty"),
    ],
    public_website_settings: [
      { organization_id: ORG, published: true, publish_state: "published", last_published_at: PUBLISHED_AT },
      { organization_id: TRIAL, published: true, publish_state: "published", last_published_at: PUBLISHED_AT },
      { organization_id: DOMAIN, published: true, publish_state: "published", last_published_at: PUBLISHED_AT },
    ],
    website_settings: [
      { organization_id: ORG, custom_domain: null, dns_ok: false, ssl_ok: false },
      { organization_id: TRIAL, custom_domain: null, dns_ok: false, ssl_ok: false },
      { organization_id: DOMAIN, custom_domain: "owned.example", dns_ok: true, ssl_ok: true },
      { organization_id: DRAFT, custom_domain: null, dns_ok: false, ssl_ok: false },
    ],
    website_versions: [
      {
        id: "v1",
        organization_id: ORG,
        version: 4,
        published_at: PUBLISHED_AT,
        seo: null,
        generation: null,
        pages: { live_format: 1, settings_pages: null, pages: livePages },
      },
    ],
    website_pages: [],
    // Sites with real content; a published shell without sections is left out of the index.
    website_sections: [
      { id: "sec-acme", organization_id: ORG },
      { id: "sec-lapsed", organization_id: TRIAL },
      { id: "sec-owned", organization_id: DOMAIN },
    ],
  };
});

describe("/s/<slug>/sitemap.xml", () => {
  it("lists only published, visible, non-thanks, non-noindex, populated pages with publish-time lastmod", async () => {
    const response = await platformTenantSitemapResponse("acme");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=600");
    const xml = await response.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locs).toEqual([
      "https://revoragrowthsystems.com/s/acme",
      "https://revoragrowthsystems.com/s/acme/services",
      "https://revoragrowthsystems.com/s/acme/about",
    ]);
    const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((match) => match[1]);
    expect(lastmods).toEqual([PUBLISHED_AT, PUBLISHED_AT, PUBLISHED_AT]);
  });

  it("sends a verified custom domain to its own sitemap", async () => {
    const response = await platformTenantSitemapResponse("owned");
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("https://owned.example/sitemap.xml");
  });

  it("serves per-client robots that allow AI crawlers and list only that sitemap", async () => {
    const response = await platformTenantRobotsResponse("acme");
    expect(response.status).toBe(200);
    const rules = await response.text();
    for (const agent of ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "PerplexityBot", "Google-Extended", "Applebot-Extended", "Bingbot"]) {
      expect(rules).toContain(`User-agent: ${agent}`);
    }
    expect(rules).toContain("Allow: /");
    expect(rules).toContain("Sitemap: https://revoragrowthsystems.com/s/acme/sitemap.xml");
    expect(rules).not.toContain("revoragrowthsystems.com/sitemap.xml");
    expect(rules).not.toContain("/pricing");
    const redirect = await platformTenantRobotsResponse("owned");
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get("location")).toBe("https://owned.example/robots.txt");
    expect((await platformTenantRobotsResponse("lapsed")).status).toBe(404);
    expect((await platformTenantRobotsResponse("drafty")).status).toBe(404);
  });

  it("returns 404 for an expired trial, an unpublished site and an unknown slug", async () => {
    expect((await platformTenantSitemapResponse("lapsed")).status).toBe(404);
    expect((await platformTenantSitemapResponse("drafty")).status).toBe(404);
    expect((await platformTenantSitemapResponse("nobody")).status).toBe(404);
    expect((await platformTenantSitemapResponse("../etc")).status).toBe(404);
  });

  it("returns 404 for a published shell whose home page is still empty", async () => {
    // Snapshot with no populated home: the page renders "still being built" with noindex.
    const snapshot = db.tables["website_versions"]![0]!;
    snapshot["pages"] = { live_format: 1, settings_pages: null, pages: livePages.map((p) => (p.kind === "home" ? { ...p, sections: [] } : p)) };
    expect((await platformTenantSitemapResponse("acme")).status).toBe(404);
    // No snapshot and no home page row at all: same.
    db.tables["website_versions"] = [];
    expect((await platformTenantSitemapResponse("acme")).status).toBe(404);
    // No snapshot, home row with a visible section: listed again.
    db.tables["website_pages"] = [{ id: "home-row", organization_id: ORG, slug: "home", kind: "home", noindex: false, is_visible: true }];
    db.tables["website_sections"] = [{ id: "sec-home", organization_id: ORG, page_id: "home-row", is_visible: true }];
    expect((await platformTenantSitemapResponse("acme")).status).toBe(200);
  });

  it("never lists a demo workspace or a test/demo/sample slug", async () => {
    db.tables["organizations"]!.push(org("55555555-5555-4555-8555-555555555555", "showroom", { is_demo: true }));
    db.tables["organizations"]!.push(org("66666666-6666-4666-8666-666666666666", "oak-city-test-demo"));
    for (const id of ["55555555-5555-4555-8555-555555555555", "66666666-6666-4666-8666-666666666666"]) {
      db.tables["public_website_settings"]!.push({ organization_id: id, published: true, publish_state: "published", last_published_at: PUBLISHED_AT });
      db.tables["website_sections"]!.push({ id: `sec-${id}`, organization_id: id });
    }
    expect((await platformTenantSitemapResponse("showroom")).status).toBe(404);
    expect((await platformTenantSitemapResponse("oak-city-test-demo")).status).toBe(404);
    const slugs = await platformSitemapSlugs();
    expect(slugs).not.toContain("showroom");
    expect(slugs).not.toContain("oak-city-test-demo");
    expect(slugs).toContain("acme");
  });

  it("dates the home entry with the publish time too", () => {
    const urls = sitemapUrls({ slug: "x", origin: "https://x.test", noindex: false, publishedAt: PUBLISHED_AT, pages: [] }, "https://x.test");
    expect(urls).toEqual([{ loc: "https://x.test", lastmod: PUBLISHED_AT }]);
  });
});

describe("/sitemaps/sites.xml", () => {
  it("surfaces a failed published read instead of advertising an empty index", async () => {
    db.failTable = "public_website_settings";
    await expect(platformSitemapSlugs()).rejects.toThrow("Published site index unavailable");
  });

  it("reads beyond the backend's 1,000 row boundary without losing sites", async () => {
    for (let i = 0; i < 1100; i++) {
      const id = `org-${i}`;
      db.tables["organizations"]?.push(org(id, `site-${i}`));
      db.tables["public_website_settings"]?.push({ organization_id: id, published: true, publish_state: "published" });
      db.tables["website_sections"]?.push({ id: `sec-${id}`, organization_id: id });
    }
    const slugs = await platformSitemapSlugs();
    expect(slugs.length).toBe(1101);
    expect(slugs).toContain("site-1099");
  });

  it("leaves a published workspace with no sections out of the index", async () => {
    db.tables["website_sections"] = [];
    expect(await platformSitemapSlugs()).toEqual([]);
  });

  it("does not silently omit sites on an eligibility lookup failure", async () => {
    db.failTable = "organizations";
    await expect(platformSitemapSlugs()).rejects.toThrow("Published site eligibility unavailable");
  });

  it("indexes only published, live-allowed sites without a verified custom domain", async () => {
    expect(await platformSitemapSlugs()).toEqual(["acme"]);
    expect(xmlSitemapIndex(["acme"])).toContain(
      "<sitemap><loc>https://revoragrowthsystems.com/s/acme/sitemap.xml</loc></sitemap>",
    );
  });
});

describe("platform sitemap lastmod", () => {
  it("gives every entry a real date: the guide's own, else the git date of its sources", async () => {
    const { xmlSitemap } = await import("./site-host.server");
    const { GUIDES } = await import("./guides");
    const { SITEMAP_LASTMOD } = await import("./sitemap-lastmod.generated");
    const urls = sitemapUrls(null, "https://revoragrowthsystems.com");
    expect(urls.length).toBeGreaterThan(50);
    // Every entry carries a lastmod: a valid calendar date, never in the future.
    const today = new Date().toISOString().slice(0, 10);
    for (const url of urls) {
      expect(url.lastmod, url.loc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(url.lastmod! <= today, `${url.loc} lastmod ${url.lastmod} is in the future`).toBe(true);
      expect(url.lastmod! <= SITEMAP_LASTMOD.generatedAt || GUIDES.some((g) => url.loc.endsWith(`/guides/${g.slug}`))).toBe(true);
    }
    // Guides keep their hand-maintained updated field.
    for (const guide of GUIDES) {
      expect(guide.published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(guide.updated >= guide.published).toBe(true);
      const url = urls.find((u) => u.loc.endsWith(`/guides/${guide.slug}`));
      expect(url?.lastmod).toBe(guide.updated);
    }
    // Not one shared date for everything.
    expect(new Set(urls.map((u) => u.lastmod)).size).toBeGreaterThan(2);
    const xml = xmlSitemap(urls);
    expect(xml.match(/<lastmod>/g)?.length).toBe(urls.length);
    expect(xml.match(/<url>/g)?.length).toBe(urls.length);
    expect(xml).toContain(`<lastmod>${new Date(GUIDES[0]!.updated).toISOString()}</lastmod>`);
  });

  it("knows a source group for every platform page, so none falls back silently", async () => {
    const { indexablePlatformEntries } = await import("./seo-intent");
    const { lastmodGroupFor } = await import("./sitemap-lastmod-sources");
    const { GUIDES } = await import("./guides");
    const { SITEMAP_LASTMOD } = await import("./sitemap-lastmod.generated");
    for (const { path } of indexablePlatformEntries()) {
      if (path.startsWith("/guides/") && GUIDES.some((g) => path === `/guides/${g.slug}`)) continue;
      const group = lastmodGroupFor(path);
      expect(group, `no lastmod group for ${path || "/"}`).not.toBeNull();
      expect(SITEMAP_LASTMOD.groups[group!], `no generated date for group ${group}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("/s/<slug>/llms.txt and brand-facts.json", () => {
  beforeEach(() => {
    db.tables["public_business_profiles"] = [
      {
        organization_id: ORG,
        description: "Family plumbing in Raleigh since 1998.",
        phone: "(919) 832-4410",
        email: "office@acmeplumbing.co",
        city: "Raleigh",
        state: "NC",
        service_area: "Raleigh, NC + 25 miles",
      },
      { organization_id: DOMAIN, description: "Owned domain business.", phone: "(919) 467-2201", city: "Cary", state: "NC" },
    ];
    db.tables["services"] = [
      { organization_id: ORG, is_active: true, name: "Water heater install", price: 1450, starting_price: null, sort_order: 1 },
      { organization_id: ORG, is_active: false, name: "Retired service", price: 10, sort_order: 2 },
    ];
    db.tables["social_profiles"] = [{ organization_id: ORG, facebook: "https://facebook.com/acme", instagram: null }];
    db.tables["public_reviews"] = [{ organization_id: ORG, author_name: "Pat", rating: 5, comment: "Great" }];
  });

  it("serves the verified facts and the published pages, never reviews or inactive services", async () => {
    const response = await platformTenantFactsResponse("acme", "llms.txt");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    const text = await response.text();
    expect(text.startsWith("# acme\n")).toBe(true);
    expect(text).toContain("> Family plumbing in Raleigh since 1998.");
    expect(text).toContain("- Phone: (919) 832-4410");
    expect(text).toContain("- Water heater install ($1450)");
    expect(text).toContain("- https://revoragrowthsystems.com/s/acme/services");
    expect(text).toContain("- https://revoragrowthsystems.com/s/acme/brand-facts.json");
    expect(text).not.toContain("Retired service");
    expect(text).not.toContain("/hidden");
    expect(text).not.toMatch(/rating|review|Pat/i);

    const json = await platformTenantFactsResponse("acme", "brand-facts.json");
    expect(json.status).toBe(200);
    expect(json.headers.get("content-type")).toContain("application/json");
    const facts = await json.json();
    expect(facts.url).toBe("https://revoragrowthsystems.com/s/acme");
    expect(facts.telephone).toBe("(919) 832-4410");
    expect(facts.services).toEqual([{ name: "Water heater install", price: "1450.00", currency: "USD" }]);
    expect(facts.sameAs).toEqual(["https://facebook.com/acme"]);
    expect(facts.updatedAt).toBe(PUBLISHED_AT);
    expect(JSON.stringify(facts)).not.toMatch(/aggregateRating|"reviews?":|"rating"/i);
  });

  it("uses the same publication gate as the sitemap and redirects to a verified custom domain", async () => {
    for (const file of ["llms.txt", "brand-facts.json"] as const) {
      expect((await platformTenantFactsResponse("lapsed", file)).status).toBe(404);
      expect((await platformTenantFactsResponse("drafty", file)).status).toBe(404);
      expect((await platformTenantFactsResponse("nobody", file)).status).toBe(404);
      const redirect = await platformTenantFactsResponse("owned", file);
      expect(redirect.status).toBe(301);
      expect(redirect.headers.get("location")).toBe(`https://owned.example/${file}`);
    }
  });

  it("throws on a failed facts read so the route answers 503 instead of an empty success", async () => {
    db.failTable = "services";
    await expect(platformTenantFactsResponse("acme", "llms.txt")).rejects.toThrow("Business facts unavailable");
  });

  it("answers a verified custom domain with that business's facts and leaves Revora's hosts alone", async () => {
    db.tables["website_pages"] = [{ id: "own-home", organization_id: DOMAIN, slug: "home", kind: "home", noindex: false, is_visible: true }];
    db.tables["website_sections"]!.push({ id: "own-sec", organization_id: DOMAIN, page_id: "own-home", is_visible: true });
    const response = await hostTenantFactsResponse("owned.example", "https", "llms.txt");
    expect(response?.status).toBe(200);
    const text = await response!.text();
    expect(text).toContain("# owned");
    expect(text).toContain("https://owned.example/brand-facts.json");
    expect(text).not.toContain("Revora");
    expect(await hostTenantFactsResponse("revoragrowthsystems.com", "https", "llms.txt")).toBeNull();
    expect(await hostTenantFactsResponse("unknown.example", "https", "brand-facts.json")).toBeNull();
  });
});
