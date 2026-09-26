/**
 * Serves a client website from the hostname the visitor typed.
 *
 * The ONLY hostname that serves a client website is the customer's own verified
 * custom domain — pages land there with no redirect and no path prefix. Hosts
 * under `revoraweb.site` are traffic-only and never a client website. Anything
 * unpublished stays private: the loader reuses the published-only reader, so
 * drafts return nothing here.
 */
import { createServerFn } from "@tanstack/react-start";
import type { loadSite } from "@/lib/public-site.server";

export type HostSiteResult = {
  slug: string;
  host: string;
  via: "custom";
  site: NonNullable<Awaited<ReturnType<typeof loadSite>>>;
} | null;

/**
 * Answers two things: does this web address belong to a client (`tenant`), and
 * is the requested page published on it (`result`). The distinction matters —
 * on a client's address a missing page must be a plain "page not found", never
 * Revora's own marketing page.
 */
export const getHostSite = createServerFn({ method: "GET" })
  .validator((input?: { pageSlug?: string }) => {
    const raw = String(input?.pageSlug ?? "")
      .trim()
      .toLowerCase()
      .slice(0, 80);
    if (raw && !/^[a-z0-9-]+$/.test(raw)) return {};
    return raw ? { pageSlug: raw } : {};
  })
  .handler(async ({ data }): Promise<{ tenant: boolean; result: HostSiteResult }> => {
    const { getRequestHost } = await import("@tanstack/react-start/server");
    const { resolveTenantHost } = await import("@/lib/site-host.server");
    const { loadSite } = await import("@/lib/public-site.server");
    const { isTrafficDomainHost } = await import("@/lib/revora-address");

    let host: string | null = null;
    try {
      host = getRequestHost({ xForwardedHost: true }) ?? null;
    } catch {
      host = null;
    }
    // `revoraweb.site` is a traffic domain: no client website ever lives on it,
    // at the root or on any label. Requests there are redirected to the
    // platform domain before reaching a page; if one is ever rendered anyway
    // (for example after loop protection stops a second redirect), it shows the
    // platform's own page rather than an empty holding page.
    if (isTrafficDomainHost(host)) {
      return { tenant: false, result: null };
    }
    const tenant = await resolveTenantHost(host);
    if (!tenant) return { tenant: false, result: null };

    // Published-only: `loadSite` refuses drafts unless an authorised preview
    // token is presented, which never happens on a public host.
    const site = await loadSite(
      tenant.slug,
      data.pageSlug ? { pageSlug: data.pageSlug } : undefined,
    );
    if (!site) return { tenant: true, result: null };
    return {
      tenant: true,
      result: { slug: tenant.slug, host: tenant.host, via: tenant.via, site },
    };
  });
