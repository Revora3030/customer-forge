/**
 * Sitemap index of client sites served on the platform address.
 *
 * One entry per published, live-allowed site without a verified custom domain,
 * pointing at its /s/<slug>/sitemap.xml. Read from the published-only
 * projection, so no draft is ever listed.
 */
import { createFileRoute } from "@tanstack/react-router";
import { platformSitemapSlugs, xmlSitemapIndex } from "@/lib/site-host.server";

export const Route = createFileRoute("/sitemaps/sites.xml")({
  server: {
    handlers: {
      GET: async () => {
        let slugs: string[] = [];
        try {
          slugs = await platformSitemapSlugs();
        } catch (error) {
          console.error("client sitemap index failed", error);
        }
        return new Response(xmlSitemapIndex(slugs), {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=600",
          },
        });
      },
    },
  },
});
