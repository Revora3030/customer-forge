import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { LivePageResult } from "@/lib/site-audit";

/**
 * Live website auditor.
 *
 * Fetches the pages that are actually served for this workspace's site and
 * reports what a customer and a search engine receive. Reads go through the
 * caller's authenticated client, so a client can only audit their own site.
 */
export const auditLiveSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => {
    const organizationId = String(input?.organizationId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(organizationId)) throw new Error("Invalid workspace");
    return { organizationId };
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{ checkedAt: string; pages: LivePageResult[]; note: string | null }> => {
      const { auditLiveHtml } = await import("@/lib/site-audit");
      const { supabase } = context;
      const orgId = data.organizationId;

      const [{ data: org }, { data: settings }, { data: pages }] = await Promise.all([
        supabase.from("organizations").select("slug").eq("id", orgId).maybeSingle(),
        supabase
          .from("website_settings")
          .select("publish_state")
          .eq("organization_id", orgId)
          .maybeSingle(),
        supabase
          .from("website_pages")
          .select("slug, title, is_visible, sort_order")
          .eq("organization_id", orgId)
          .order("sort_order"),
      ]);

      if (!org?.slug) throw new Error("This workspace has no website address yet.");
      if (settings?.publish_state !== "published")
        return {
          checkedAt: new Date().toISOString(),
          pages: [],
          note: "Your site isn't published yet, so there are no live pages to scan. Publish first, then re-run the live audit.",
        };

      const origin = new URL(getRequest().url).origin;
      const paths = [
        `/s/${org.slug}`,
        ...(pages ?? [])
          .filter((page) => page.is_visible !== false && page.slug !== "home")
          .slice(0, 7)
          .map((page) => `/s/${org.slug}/${page.slug}`),
      ];

      const results: LivePageResult[] = [];
      for (const path of paths) {
        const url = `${origin}${path}`;
        try {
          const response = await fetch(url, { headers: { "user-agent": "RevoraAuditor/1.0" } });
          const html = response.ok ? await response.text() : "";
          results.push(auditLiveHtml(path, url, response.status, html));
        } catch {
          results.push(auditLiveHtml(path, url, 599, ""));
        }
      }

      return { checkedAt: new Date().toISOString(), pages: results, note: null };
    },
  );
