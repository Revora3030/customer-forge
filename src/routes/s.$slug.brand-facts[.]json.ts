/**
 * brand-facts.json for a client site on its platform address (/s/<slug>): the owner's
 * verified business facts for AI crawlers, built from the same record as the
 * page's LocalBusiness data. Same publication gate as the per-client sitemap;
 * a verified custom domain owns the canonical copy and gets a redirect.
 */
import { createFileRoute } from "@tanstack/react-router";
import { platformTenantFactsResponse } from "@/lib/site-host.server";

export const Route = createFileRoute("/s/$slug/brand-facts.json")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          return await platformTenantFactsResponse(params.slug, "brand-facts.json");
        } catch (error) {
          console.error("tenant brand-facts.json failed", error);
          return new Response("Business facts temporarily unavailable", {
            status: 503,
            headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "retry-after": "60" },
          });
        }
      },
    },
  },
});
