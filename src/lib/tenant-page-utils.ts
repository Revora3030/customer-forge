import { notFound, redirect } from "@tanstack/react-router";
import { getHostSite, type HostSiteResult } from "@/lib/host-site.functions";
import { canonicalSiteUrl, isPossibleTenantHost } from "@/lib/revora-address";
import { tenantSiteHead } from "@/lib/site-head";
import { PRIVACY_NOTICE_SLUG } from "@/lib/privacy-notice-slug";

/** True when the request is on a client's verified custom domain. */
export async function isClientDomainRequest(): Promise<boolean> {
  if (typeof window !== "undefined" && !isPossibleTenantHost(window.location.hostname))
    return false;
  try {
    return Boolean((await getHostSite({ data: {} }))?.tenant);
  } catch {
    // A failed lookup must not take Revora's own policy pages down.
    return false;
  }
}

/**
 * Revora's own /privacy and /terms must never appear on a client's domain.
 * There, /privacy goes to the client's generated privacy notice, and /terms
 * goes to the client's home page: the platform has no terms from the business,
 * so it does not invent any. Both are temporary (302) so an owner-built page
 * can take over later.
 */
export async function clientDomainLegalRedirect(page: "privacy" | "terms"): Promise<void> {
  if (!(await isClientDomainRequest())) return;
  throw redirect({ href: page === "privacy" ? `/${PRIVACY_NOTICE_SLUG}` : "/", statusCode: 302 });
}

export async function loadTenantPage(pageSlug: string): Promise<HostSiteResult> {
  if (typeof window !== "undefined" && !isPossibleTenantHost(window.location.hostname)) {
    return null;
  }
  let response: Awaited<ReturnType<typeof getHostSite>> | null = null;
  try {
    response = await getHostSite({ data: { pageSlug } });
  } catch {
    return null;
  }
  if (!response?.tenant) return null;
  if (!response.result?.site?.content) throw notFound();
  return response.result;
}

/**
 * Head for a client's /about, /contact or /pricing on their own domain: the
 * same shared client head as every other client page (share image,
 * og:site_name, LocalBusiness data, fonts), never Revora's.
 */
export function tenantPageHead(result: HostSiteResult) {
  if (!result?.site?.content) return null;
  const page = result.site.content.page;
  const url =
    canonicalSiteUrl(result.site.settings, result.slug, page.slug, page.seo_canonical) ??
    `https://${result.host}/${page.slug}`;
  return tenantSiteHead({
    site: result.site,
    pageSlug: page.slug,
    canonical: url,
    businessUrl: `https://${result.host}/`,
  });
}
