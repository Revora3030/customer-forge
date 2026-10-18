/**
 * Sitemap for a client site on its platform address (/s/<slug>).
 *
 * Lists only a published site that is allowed to be live right now, built from
 * the published copy. A verified custom domain owns the canonical URLs, so the
 * request is redirected to that domain's own /sitemap.xml.
 */
import { createFileRoute } from "@tanstack/react-router";
import { platformTenantSitemapResponse } from "@/lib/site-host.server";

export const Route = createFileRoute("/s/$slug/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          return await platformTenantSitemapResponse(params.slug);
        } catch (error) {
          console.error("tenant sitemap failed", error);
          return new Response("Sitemap unavailable", {
            status: 503,
            headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
          });
        }
      },
    },
  },
});
