/**
 * robots.txt for a client site on its platform address (/s/<slug>).
 *
 * Allows AI and search crawlers and points at that client's sitemap only.
 * A verified custom domain owns the canonical URLs, so the request is
 * redirected to that domain's own /robots.txt. Unpublished, demo and empty
 * sites are not advertised.
 */
import { createFileRoute } from "@tanstack/react-router";
import { platformTenantRobotsResponse } from "@/lib/site-host.server";

export const Route = createFileRoute("/s/$slug/robots.txt")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          return await platformTenantRobotsResponse(params.slug);
        } catch (error) {
          console.error("tenant robots failed", error);
          return new Response("Crawler rules temporarily unavailable", {
            status: 503,
            headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "retry-after": "60" },
          });
        }
      },
    },
  },
});
