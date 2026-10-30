import { createFileRoute } from "@tanstack/react-router";
import { indexNowKey } from "@/lib/indexnow";

// IndexNow's default key location: /<key>.txt at the host root, containing just
// the key. Only the key for the requesting host is answered; any other
// /<name>.txt is a plain 404, so this never exposes or invents other files.
export const Route = createFileRoute("/{$key}.txt")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
        const key = await indexNowKey(host, process.env["INDEXNOW_KEY"]);
        if (params.key !== key) {
          return new Response("Not found", {
            status: 404,
            headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" },
          });
        }
        return new Response(key, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
