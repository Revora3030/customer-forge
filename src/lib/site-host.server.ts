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

import {
  REVORA_OWN_HOSTS,
  isRevoraOwnHost,
  isTrafficDomainHost,
  normalizeHost,
} from "@/lib/revora-address";

export const REVORA_HOSTS = REVORA_OWN_HOSTS;

export type HostSite = {
  slug: string;
  origin: string;
  pages: { slug: string; updatedAt: string | null }[];
  noindex: boolean;
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

  // The sitemap advertises the published copy, not unpublished draft pages.
  const { loadLiveSnapshot } = await import("@/lib/public-site.server");
  const live = await loadLiveSnapshot(tenant.organizationId);
  const scheme0 = /^(localhost|127\.0\.0\.1)(:|$)/.test(tenant.host) ? protocol : "https";
  if (live) {
    return {
      slug: tenant.slug,
      origin: `${scheme0}://${tenant.host}`,
      noindex: false,
      pages: live.pages
        .filter(
          (p) =>
            p["is_visible"] !== false &&
            p["noindex"] !== true &&
            (p.sections ?? []).some((section) => section["is_visible"] !== false),
        )
        .sort((a, b) => Number(a["sort_order"] ?? 0) - Number(b["sort_order"] ?? 0))
        .map((p) => ({ slug: String(p["slug"] ?? ""), updatedAt: live.publishedAt })),
    };
  }

  const supabase = publicClient();
  const [{ data: pages }, { data: sections }] = await Promise.all([
    supabase
      .from("website_pages")
      .select("id, slug, updated_at, noindex")
      .eq("organization_id", tenant.organizationId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("website_sections")
      .select("page_id, is_visible")
      .eq("organization_id", tenant.organizationId),
  ]);

  // A page with no visible sections renders blank — never advertise it publicly.
  const populated = new Set(
    (sections ?? []).filter((s) => s.is_visible !== false).map((s) => s.page_id as string),
  );

  // Live sites are always served over HTTPS; only local development is http, so
  // never publish an http:// canonical or sitemap URL for a real hostname.
  const scheme = /^(localhost|127\.0\.0\.1)(:|$)/.test(tenant.host) ? protocol : "https";

  return {
    slug: tenant.slug,
    origin: `${scheme}://${tenant.host}`,
    noindex: false,

    pages: (pages ?? [])
      .filter((p) => !p.noindex && populated.has(p.id as string))
      .map((p) => ({ slug: p.slug, updatedAt: p.updated_at ?? null })),
  };
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
  const paths = [{ slug: "home", updatedAt: null as string | null }, ...site.pages].filter(
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
