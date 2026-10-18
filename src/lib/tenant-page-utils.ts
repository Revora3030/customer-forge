import { notFound } from "@tanstack/react-router";
import { getHostSite, type HostSiteResult } from "@/lib/host-site.functions";
import { canonicalSiteUrl, isPossibleTenantHost } from "@/lib/revora-address";
import { tenantSiteHead } from "@/lib/site-head";

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
