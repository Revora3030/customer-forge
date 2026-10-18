import { createFileRoute } from "@tanstack/react-router";
import { platformOrigin, resolveHostSite } from "@/lib/site-host.server";

export const Route = createFileRoute("/robots.txt")({
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
          console.error("robots host resolution failed", error);
        }
        const origin = site ? site.origin : platformOrigin(host ?? url.host, protocol);
        // Private application surfaces must never be indexed: the workspace, the
        // platform admin, the client portal, auth screens, invitations and
        // shareable preview links.
        const disallowed = [
          "/app",
          "/admin",
          "/my",
          "/onboarding",
          "/auth",
          "/reset-password",
          "/invite/",
          "/p/",
          "/api/",
          "/_serverFn/",
        ];
        const lines = [
          ...["Googlebot", "Bingbot", "Twitterbot", "facebookexternalhit"].flatMap((agent) => [
            `User-agent: ${agent}`,
            "Allow: /",
            ...disallowed.map((path) => `Disallow: ${path}`),
            "",
          ]),
          "User-agent: *",
          "Allow: /",
          ...disallowed.map((path) => `Disallow: ${path}`),

          "",
          `Sitemap: ${site ? site.origin : origin}/sitemap.xml`,
          // Client sites on the platform address (/s/<slug>) are listed in
          // their own index; only the platform host advertises it.
          ...(site ? [] : ["Sitemap: https://revoragrowthsystems.com/sitemaps/sites.xml"]),
          ...(site ? [] : [`# AI crawler summary: ${origin}/llms.txt`]),
          "",
        ];

        return new Response(lines.join("\n"), {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=600",
          },
        });
      },
    },
  },
});
