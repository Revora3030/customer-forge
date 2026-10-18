/**
 * Sitemaps for client sites on the platform address (/s/<slug>): only
 * published, live-allowed sites; only visible, indexable, populated pages;
 * publish-time lastmod everywhere; a verified custom domain owns its own.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const db: { tables: Record<string, Row[]> } = { tables: {} };

function fakeClient() {
  return {
    from(table: string) {
      const filters: ((row: Row) => boolean)[] = [];
      let notNull: string | null = null;
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
        limit: () => chain,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: rows(), error: null }),
      };
      return chain;
    },
  };
}

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: fakeClient() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => fakeClient() }));

import { platformSitemapSlugs, platformTenantSitemapResponse, sitemapUrls, xmlSitemapIndex } from "./site-host.server";

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
  is_demo: true,
  is_suspended: false,
  setup_paid_at: null,
  setup_payment_status: null,
  trial_ends_at: null,
  created_at: "2026-01-01T00:00:00Z",
  subscription_status: null,
  ...over,
});

beforeEach(() => {
  db.tables = {
    organizations: [
      org(ORG, "acme"),
      // Trial ended without the setup payment: the site is offline.
      org(TRIAL, "lapsed", { is_demo: false, trial_ends_at: "2026-02-01T00:00:00Z" }),
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
    website_sections: [],
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

  it("returns 404 for an expired trial, an unpublished site and an unknown slug", async () => {
    expect((await platformTenantSitemapResponse("lapsed")).status).toBe(404);
    expect((await platformTenantSitemapResponse("drafty")).status).toBe(404);
    expect((await platformTenantSitemapResponse("nobody")).status).toBe(404);
    expect((await platformTenantSitemapResponse("../etc")).status).toBe(404);
  });

  it("dates the home entry with the publish time too", () => {
    const urls = sitemapUrls({ slug: "x", origin: "https://x.test", noindex: false, publishedAt: PUBLISHED_AT, pages: [] }, "https://x.test");
    expect(urls).toEqual([{ loc: "https://x.test", lastmod: PUBLISHED_AT }]);
  });
});

describe("/sitemaps/sites.xml", () => {
  it("indexes only published, live-allowed sites without a verified custom domain", async () => {
    expect(await platformSitemapSlugs()).toEqual(["acme"]);
    expect(xmlSitemapIndex(["acme"])).toContain(
      "<sitemap><loc>https://revoragrowthsystems.com/s/acme/sitemap.xml</loc></sitemap>",
    );
  });
});
