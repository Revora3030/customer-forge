import { createFileRoute } from "@tanstack/react-router";
import { platformOrigin, resolveHostSite, sitemapUrls, xmlSitemap } from "@/lib/site-host.server";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
        const protocol = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
        let site = null;
        try {
          site = await resolveHostSite(host, protocol);
        } catch (error) {
          console.error("sitemap host resolution failed", error);
          return new Response("Sitemap temporarily unavailable", {
            status: 503,
            headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "retry-after": "60" },
          });
        }
        const origin = site ? site.origin : platformOrigin(host ?? url.host, protocol);
        return new Response(xmlSitemap(sitemapUrls(site, origin)), {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=600",
          },
        });
      },
    },
  },
});
