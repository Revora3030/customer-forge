/**
 * Request gate for websites past their post-cancellation grace period
 * (src/lib/site-hosting.ts): answers with the neutral 410 page before any
 * route renders. Fails open: any lookup error serves the site as usual.
 * Lookups are cached briefly per server instance so ordinary page views do
 * not add database reads to every request.
 */
import { isRevoraOwnHost, isTrafficDomainHost } from "@/lib/revora-address";
import { siteRequestTarget, siteUnavailableResponse } from "@/lib/site-unavailable";

const TTL_MS = 60_000;
const MAX_ENTRIES = 1000;
const cache = new Map<string, { ended: boolean; expires: number }>();

async function lookupEnded(key: string, resolve: () => Promise<string | null>): Promise<boolean> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.ended;
  let ended = false;
  try {
    const orgId = await resolve();
    if (orgId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { hostingOfflineAt } = await import("@/lib/site-hosting.server");
      if (await hostingOfflineAt(supabaseAdmin as never, orgId)) {
        const { data } = await supabaseAdmin.from("organizations").select("id, is_demo").eq("id", orgId).maybeSingle();
        const { hostingExempt } = await import("@/lib/site-hosting");
        ended = Boolean(data) && !hostingExempt(data);
      }
    }
  } catch {
    ended = false;
  }
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(key, { ended, expires: Date.now() + TTL_MS });
  return ended;
}

export function clearSiteUnavailableCache() {
  cache.clear();
}

export async function siteUnavailableGate(request: Request): Promise<Response | null> {
  const target = siteRequestTarget(request, (host) => isRevoraOwnHost(host) || isTrafficDomainHost(host));
  if (!target) return null;
  const ended =
    target.kind === "slug"
      ? await lookupEnded(`slug:${target.slug}`, async () => {
          const { publicOrganization } = await import("@/lib/public-site.server");
          return (await publicOrganization({ slug: target.slug }))?.id ?? null;
        })
      : await lookupEnded(`host:${target.host}`, async () => {
          const { resolveTenantHost } = await import("@/lib/site-host.server");
          return (await resolveTenantHost(target.host))?.organizationId ?? null;
        });
  return ended ? siteUnavailableResponse(request.method) : null;
}
