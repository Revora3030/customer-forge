/**
 * Host resolution for published business websites.
 *
 * A tenant site is reachable at `/s/:slug` on the platform domain and at the
 * customer's OWN verified custom domain. Revora-owned subdomains are not a
 * hosting product: no host under `revoraweb.site` can ever resolve to a client
 * organization. `robots.txt` and `sitemap.xml` must describe the business that
 * owns the requested host — not the Revora marketing site — so both are
 * resolved from the incoming Host header.
 */
import { publicClient, publicOrganization } from "@/lib/public-site.server";
import { indexablePlatformPaths } from "@/lib/seo-intent";
import { fetchAllRows } from "@/lib/paginate";

import {
  PLATFORM_ORIGIN,
  REVORA_OWN_HOSTS,
  isRevoraOwnHost,
  isTrafficDomainHost,
  normalizeHost,
  primaryAddress,
} from "@/lib/revora-address";

export const REVORA_HOSTS = REVORA_OWN_HOSTS;

export type HostSite = {
  slug: string;
  origin: string;
  pages: { slug: string; updatedAt: string | null }[];
  noindex: boolean;
  /** When the served copy was published; the lastmod of every entry. */
  publishedAt?: string | null;
};

export type TenantHost = {
  organizationId: string;
  slug: string;
  /** Which address the visitor arrived on. Only customer-owned domains resolve. */
  via: "custom";
  host: string;
};

/**
 * Resolves which organization owns an incoming host.
 *
 * ONLY a customer-owned custom domain can resolve, and only once DNS **and**
 * HTTPS have been verified — so a half-configured domain can never serve a
 * client's site over a broken certificate. Revora's own hosts, and every host
 * under the traffic-only domain, are rejected before any lookup runs, so
 * `*.revoraweb.site` is structurally incapable of becoming a client website.
 *
 * One host maps to exactly one organization, which is what keeps one client's
 * host from ever reaching another's website.
 */
export async function resolveTenantHost(rawHost: string | null): Promise<TenantHost | null> {
  if (!rawHost) return null;
  const host = normalizeHost(rawHost);
  if (!host) return null;
  // Revora's own hosts are not tenants, and `revoraweb.site` is traffic-only:
  // no hostname on it may ever resolve to a client website.
  if (isRevoraOwnHost(host) || isTrafficDomainHost(host)) return null;

  // Address settings are private, so the lookup runs with server credentials on
  // the server only. It returns nothing but the owning workspace, and callers
  // still go through the published-only site reader.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const bare = host.replace(/^www\./, "");

  // Host headers are attacker-controlled, so every candidate is looked up with a
  // parameterized .eq() filter. Nothing from the header is ever spliced into a
  // filter expression string, where commas or parentheses could restructure the
  // query.
  const columns = "organization_id, custom_domain, dns_ok, ssl_ok";
  const lookups = [
    supabaseAdmin.from("website_settings").select(columns).eq("custom_domain", host).limit(2),
    ...(bare !== host
      ? [supabaseAdmin.from("website_settings").select(columns).eq("custom_domain", bare).limit(2)]
      : []),
  ];

  const results = await Promise.all(lookups);
  if (results.some((result) => result.error)) throw new Error("Domain lookup unavailable");
  const seen = new Set<string>();
  const ordered = results
    .flatMap((result) => result.data ?? [])
    .filter((row) => {
      const key = `${row.organization_id}:${row.custom_domain ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  for (const row of ordered) {
    if (!row.organization_id) continue;
    const domain = row.custom_domain?.toLowerCase();
    const verified = (domain === host || domain === bare) && !!row.dns_ok && !!row.ssl_ok;
    if (!verified) continue;
    const org = await publicOrganization({ id: row.organization_id });
    if (!org?.slug) continue;
    return {
      organizationId: row.organization_id,
      slug: org.slug,
      via: "custom",
      host,
    };
  }
  return null;
}

/**
 * Returns the published tenant that owns this host, or null when the host is
 * Revora's own marketing site / preview environment.
 */
export async function resolveHostSite(
  rawHost: string | null,
  protocol = "https",
): Promise<HostSite | null> {
  const tenant = await resolveTenantHost(rawHost);
  if (!tenant) return null;

  const { pages, publishedAt } = await tenantSitemapPages(tenant.organizationId);
  // Live sites are always served over HTTPS; only local development is http, so
  // never publish an http:// canonical or sitemap URL for a real hostname.
  const scheme = /^(localhost|127\.0\.0\.1)(:|$)/.test(tenant.host) ? protocol : "https"; // DevSkim: ignore DS162092 -- Detects local development only, so real hosts always get https.
  return {
    slug: tenant.slug,
    origin: `${scheme}://${tenant.host}`,
    noindex: false,
    publishedAt,
    pages,
  };
}

/**
 * The published, indexable pages of one tenant, shared by the custom-domain
 * sitemap and the /s/<slug> sitemap. Reads only the published copy (the live
 * snapshot, else the published-only public projection), never draft rows.
 * Every lastmod is the publish time, home included.
 */
export async function tenantSitemapPages(
  organizationId: string,
): Promise<{ pages: HostSite["pages"]; publishedAt: string | null; homeReady: boolean }> {
  const { loadLiveSnapshot } = await import("@/lib/public-site.server");
  const live = await loadLiveSnapshot(organizationId);
  if (live) {
    // The home page renders "still being built" when it has no visible
    // section; such a site has nothing to advertise to search engines.
    const home = live.pages.find((p) => p["kind"] === "home" && p["is_visible"] !== false);
    return {
      homeReady: Boolean(home && (home.sections ?? []).some((section) => section["is_visible"] !== false)),
      publishedAt: live.publishedAt,
      pages: live.pages
        .filter(
          (p) =>
            p["is_visible"] !== false &&
            p["noindex"] !== true &&
            p["kind"] !== "thanks" &&
            p["kind"] !== "home" &&
            (p.sections ?? []).some((section) => section["is_visible"] !== false),
        )
        .sort((a, b) => Number(a["sort_order"] ?? 0) - Number(b["sort_order"] ?? 0))
        .map((p) => ({ slug: String(p["slug"] ?? ""), updatedAt: live.publishedAt }))
        .filter((p) => /^[a-z0-9-]+$/.test(p.slug)),
    };
  }

  const supabase = publicClient();
  const [pageResult, sectionResult, settingsResult] = await Promise.all([
    fetchAllRows((from, to) => supabase
      .from("website_pages")
      .select("id, slug, kind, noindex, is_visible")
      .eq("organization_id", organizationId)
      .order("sort_order", { ascending: true }).order("id").range(from, to)),
    fetchAllRows((from, to) => supabase
      .from("website_sections")
      .select("page_id, is_visible")
      .eq("organization_id", organizationId).order("id").range(from, to)),
    supabase
      .from("public_website_settings")
      .select("last_published_at")
      .eq("organization_id", organizationId)
      .maybeSingle(),
  ]);
  if (pageResult.error || sectionResult.error || settingsResult.error) throw new Error("Published sitemap content unavailable");
  const pages = pageResult.rows;
  const sections = sectionResult.rows;
  const settings = settingsResult.data;

  // A page with no visible sections renders blank — never advertise it publicly.
  const populated = new Set(
    (sections ?? []).filter((s) => s.is_visible !== false).map((s) => s.page_id as string),
  );
  const publishedAt = (settings?.last_published_at as string | null | undefined) ?? null;
  const home = (pages ?? []).find((p) => p.kind === "home" && p.is_visible !== false);

  return {
    homeReady: Boolean(home && populated.has(home.id as string)),
    publishedAt,
    pages: (pages ?? [])
      // Hidden pages and the after-form thank-you page are never advertised.
      .filter(
        (p) =>
          !p.noindex &&
          p.is_visible !== false &&
          p.kind !== "thanks" &&
          p.kind !== "home" &&
          populated.has(p.id as string) &&
          /^[a-z0-9-]+$/.test(String(p.slug ?? "")),
      )
      .map((p) => ({ slug: p.slug, updatedAt: publishedAt })),
  };
}

const SITEMAP_HEADERS = {
  "content-type": "application/xml; charset=utf-8",
  "cache-control": "public, max-age=600",
} as const;

type AddressRow = {
  organization_id: string | null;
  custom_domain: string | null;
  dns_ok: boolean | null;
  ssl_ok: boolean | null;
};

/**
 * Response for /s/<slug>/sitemap.xml. Only a published site that is allowed
 * to be live right now is listed; a verified custom domain owns the canonical
 * URLs, so the request is sent to that domain's own sitemap instead.
 */
export async function platformTenantSitemapResponse(rawSlug: string): Promise<Response> {
  const notFound = () =>
    new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=600" },
    });
  const slug = String(rawSlug ?? "").trim().toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return notFound();
  const org = await publicOrganization({ slug });
  if (!org?.id) return notFound();

  const { siteIsLive } = await import("@/lib/public-site.server");
  const { data: gate, error: gateError } = await publicClient()
    .from("public_website_settings")
    .select("published, publish_state")
    .eq("organization_id", org.id)
    .maybeSingle();
  if (gateError) throw new Error("Publication status unavailable");
  if (!gate || gate.published !== true || gate.publish_state !== "published") return notFound();
  if (!(await siteIsLive(org.id))) return notFound();

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: address, error: addressError } = await supabaseAdmin
    .from("website_settings")
    .select("organization_id, custom_domain, dns_ok, ssl_ok")
    .eq("organization_id", org.id)
    .maybeSingle();
  if (addressError) throw new Error("Canonical address unavailable");
  const domain = address ? primaryAddress(address as AddressRow) : null;
  if (domain) {
    return new Response(null, {
      status: 301,
      headers: { location: `https://${domain}/sitemap.xml`, "cache-control": "public, max-age=600" },
    });
  }

  const { pages, publishedAt, homeReady } = await tenantSitemapPages(org.id);
  // A published shell whose home is still empty serves a noindex placeholder,
  // so its sitemap must not advertise it (the /sitemaps/sites.xml index leaves
  // it out for the same reason).
  if (!homeReady) return notFound();
  const site: HostSite = {
    slug: org.slug,
    origin: `${PLATFORM_ORIGIN}/s/${org.slug}`,
    noindex: false,
    publishedAt,
    pages,
  };
  return new Response(xmlSitemap(sitemapUrls(site, site.origin)), { headers: SITEMAP_HEADERS });
}

/**
 * Slugs listed in the platform's /sitemaps/sites.xml index: published sites
 * that are live right now and have no verified custom domain (those advertise
 * their own sitemap on their own host).
 */
export async function platformSitemapSlugs(): Promise<string[]> {
  // Published-only projection: drafts are not visible through it.
  const publishedResult = await fetchAllRows((from, to) => publicClient()
    .from("public_website_settings")
    .select("organization_id, published, publish_state")
    .eq("published", true)
    .eq("publish_state", "published")
    .order("organization_id").range(from, to));
  if (publishedResult.error) throw new Error("Published site index unavailable");
  const published = publishedResult.rows;
  const ids = [
    ...new Set(
      (published ?? [])
        .filter((row) => row.published === true && row.publish_state === "published")
        .map((row) => row.organization_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  if (!ids.length) return [];

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { SITE_ACCESS_COLUMNS, siteAccess } = await import("@/lib/site-access");
  // Bounded ID batches avoid oversized filters while retaining the existing access boundary.
  const orgs: (Parameters<typeof siteAccess>[0] & { id: string; slug: string | null })[] = [];
  const addresses: AddressRow[] = [];
  const withSections = new Set<string>();
  for (let start = 0; start < ids.length; start += 200) {
    const batch = ids.slice(start, start + 200);
    const [orgResult, addressResult] = await Promise.all([
    fetchAllRows((from, to) => supabaseAdmin
      .from("organizations")
      .select(`${SITE_ACCESS_COLUMNS}, slug`)
      .in("id", batch)
      .eq("is_suspended", false).order("id").range(from, to)),
    fetchAllRows((from, to) => supabaseAdmin
      .from("website_settings")
      .select("organization_id, custom_domain, dns_ok, ssl_ok")
      .in("organization_id", batch).order("organization_id").range(from, to)),
  ]);
    if (orgResult.error || addressResult.error) throw new Error("Published site eligibility unavailable");
    orgs.push(...orgResult.rows);
    addresses.push(...addressResult.rows);
    // A published workspace with no sections yet is an empty shell: keep it out of the sitemap.
    const built = await fetchAllRows((from, to) => supabaseAdmin
      .from("website_sections")
      .select("id, organization_id")
      .in("organization_id", batch).order("id").range(from, to));
    if (built.error) throw new Error("Published site content unavailable");
    for (const row of built.rows as { organization_id: string }[]) withSections.add(row.organization_id);
  }
  const ownDomain = new Set(
    ((addresses ?? []) as AddressRow[])
      .filter((row) => row.organization_id && primaryAddress(row))
      .map((row) => row.organization_id as string),
  );
  return ((orgs ?? []) as unknown as (Parameters<typeof siteAccess>[0] & { id: string; slug: string | null })[])
    .filter((org) => org && typeof org.slug === "string" && /^[a-z0-9-]{1,80}$/.test(org.slug))
    .filter((org) => !ownDomain.has(org.id))
    .filter((org) => withSections.has(org.id))
    .filter((org) => siteAccess(org).live)
    .map((org) => org.slug as string)
    .sort();
}

/** A <sitemapindex> pointing at each listed /s/<slug>/sitemap.xml. */
export function xmlSitemapIndex(slugs: string[], origin = PLATFORM_ORIGIN) {
  const body = slugs
    .map((slug) => `  <sitemap><loc>${origin}/s/${slug}/sitemap.xml</loc></sitemap>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`; // DevSkim: ignore DS137138 -- XML namespace identifier required by the sitemap protocol; never fetched.
}

/** Absolute URLs for a tenant site, or for Revora's own marketing pages. */
/**
 * Absolute URLs for a tenant site, or for Revora's own marketing pages.
 *
 * Revora's own list comes from the SEO inventory, so only canonical, indexable
 * pages with real unique value are advertised: private surfaces, demos, share
 * helpers and thin pages are excluded automatically rather than by hand.
 */
export function sitemapUrls(site: HostSite | null, origin: string) {
  if (!site) {
    return indexablePlatformPaths().map((path) => ({
      loc: `${origin}${path}`,
      // No fabricated lastmod: a build-time date on a static page is noise.
      lastmod: null as string | null,
    }));
  }
  const paths = [{ slug: "home", updatedAt: site.publishedAt ?? null }, ...site.pages].filter(
    (p, i, all) => all.findIndex((x) => x.slug === p.slug) === i,
  );
  return paths.map((page) => ({
    loc: page.slug === "home" ? site.origin : `${site.origin}/${page.slug}`,
    lastmod: page.updatedAt,
  }));
}

export function xmlSitemap(urls: { loc: string; lastmod: string | null }[]) {
  const body = urls
    .map(
      ({ loc, lastmod }) =>
        `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>` : ""}</url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/**
 * Canonical origin for Revora's own marketing site. Preview and *.lovable.app
 * hosts must still advertise the primary domain in robots.txt / sitemap.xml so
 * crawlers never index or follow a throwaway build host.
 */
export function platformOrigin(host: string | null, protocol = "https") {
  const bare = ((host ?? "").split(":")[0] ?? "").toLowerCase();
  if (/^(localhost|127\.0\.0\.1)$/.test(bare)) return `${protocol}://${host}`;
  return "https://revoragrowthsystems.com";
}
