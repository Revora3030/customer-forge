/**
 * IndexNow for customer websites: after a publish succeeds, tell Bing (and the
 * other IndexNow engines) which published pages to recrawl.
 *
 * - Only a live, non-demo site is submitted, and only its published, indexable
 *   pages (the same list its sitemap advertises).
 * - A verified custom domain owns its URLs and proves ownership with the key
 *   file served on that host; every other site is listed under /s/<slug> on the
 *   platform domain, whose key file sits at the platform root.
 * - At most one submission per site every 30 minutes, so live edits that
 *   republish in quick succession do not resend the same list.
 * - Never throws: a search ping can neither fail a publish nor hold it up for
 *   longer than its short timeout.
 */
import { PLATFORM_ORIGIN } from "@/lib/revora-address";
import type { HostSite } from "@/lib/site-host.server";

export const SITE_INDEXNOW_COOLDOWN_MS = 30 * 60 * 1000;
export const SITE_INDEXNOW_TIMEOUT_MS = 5_000;
export const SITE_INDEXNOW_ACTION = "INDEXNOW_SUBMITTED";

export type SiteIndexNowResult = { ok: boolean; submitted: number; message: string };

/** Where a site's pages live and which host's key file proves ownership. */
export function siteIndexNowTarget(input: {
  slug: string;
  domain: string | null;
  pages: HostSite["pages"];
  publishedAt: string | null;
  sitemapUrls: (site: HostSite, origin: string) => { loc: string }[];
}): { hostOrigin: string; urls: string[] } {
  const hostOrigin = input.domain ? `https://${input.domain}` : PLATFORM_ORIGIN;
  const siteOrigin = input.domain ? hostOrigin : `${PLATFORM_ORIGIN}/s/${input.slug}`;
  const site: HostSite = { slug: input.slug, origin: siteOrigin, noindex: false, publishedAt: input.publishedAt, pages: input.pages };
  return { hostOrigin, urls: input.sitemapUrls(site, siteOrigin).map((entry) => entry.loc) };
}

/** True when no submission for this site happened inside the cooldown. */
export function siteIndexNowDue(lastSubmittedAt: string | null | undefined, now: number): boolean {
  if (!lastSubmittedAt) return true;
  const last = Date.parse(lastSubmittedAt);
  return !Number.isFinite(last) || now - last >= SITE_INDEXNOW_COOLDOWN_MS;
}

export async function submitPublishedSiteToIndexNow(
  organizationId: string,
  fetcher: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<SiteIndexNowResult> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { publicOrganization, siteIsLive } = await import("@/lib/public-site.server");
    const { primaryAddress } = await import("@/lib/revora-address");
    const { sitemapUrls, tenantSitemapPages } = await import("@/lib/site-host.server");
    const { INDEXNOW_ENDPOINT, describeIndexNowStatus, indexNowKey, indexNowPayload } = await import("@/lib/indexnow");

    const org = await publicOrganization({ id: organizationId });
    if (!org?.slug || org.is_demo) return { ok: false, submitted: 0, message: "Not submitted: demo or unnamed site." };
    if (!(await siteIsLive(organizationId))) return { ok: false, submitted: 0, message: "Not submitted: the site is not live." };

    const { data: last } = await supabaseAdmin
      .from("audit_logs")
      .select("created_at")
      .eq("organization_id", organizationId)
      .eq("action", SITE_INDEXNOW_ACTION)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!siteIndexNowDue(last?.created_at, now)) return { ok: true, submitted: 0, message: "Submitted recently; skipped." };

    const { data: address } = await supabaseAdmin
      .from("website_settings")
      .select("custom_domain, dns_ok, ssl_ok")
      .eq("organization_id", organizationId)
      .maybeSingle();
    const domain = address ? primaryAddress(address) : null;
    const { pages, publishedAt } = await tenantSitemapPages(organizationId);
    const { hostOrigin, urls } = siteIndexNowTarget({ slug: org.slug, domain, pages, publishedAt, sitemapUrls });
    const payload = indexNowPayload(hostOrigin, urls, await indexNowKey(new URL(hostOrigin).host, process.env["INDEXNOW_KEY"]));
    if (!payload.urlList.length) return { ok: false, submitted: 0, message: "Not submitted: no published pages." };

    const response = await fetcher(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SITE_INDEXNOW_TIMEOUT_MS),
    });
    const status = describeIndexNowStatus(response.status);
    await supabaseAdmin.from("audit_logs").insert({
      organization_id: organizationId,
      action: SITE_INDEXNOW_ACTION,
      entity: "website",
      entity_id: organizationId,
      metadata: { status: response.status, ok: status.ok, host: payload.host, submitted: payload.urlList.length } as never,
    });
    return { ...status, submitted: status.ok ? payload.urlList.length : 0 };
  } catch {
    return { ok: false, submitted: 0, message: "IndexNow could not be reached; the publish is unaffected." };
  }
}
