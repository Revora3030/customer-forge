/**
 * /brand-facts.json on a verified client custom domain: that business's
 * verified facts as JSON (see tenant-llms.ts). Revora's own hosts have no
 * brand-facts file, so they answer 404.
 */
import { createFileRoute } from "@tanstack/react-router";
import { hostTenantFactsResponse } from "@/lib/site-host.server";

export const Route = createFileRoute("/brand-facts.json")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
        const protocol = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
        try {
          const response = await hostTenantFactsResponse(host, protocol, "brand-facts.json");
          if (response) return response;
        } catch (error) {
          console.error("brand facts host resolution failed", error);
          return new Response("Business facts temporarily unavailable", {
            status: 503,
            headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "retry-after": "60" },
          });
        }
        return new Response("Not found", {
          status: 404,
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=600" },
        });
      },
    },
  },
});
