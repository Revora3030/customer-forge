import { createFileRoute } from "@tanstack/react-router";
import { indexNowKey } from "@/lib/indexnow";

// IndexNow fetches this file to confirm Revora owns the host it submits.
export const Route = createFileRoute("/indexnow-key.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(indexNowKey(process.env.INDEXNOW_KEY), {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        }),
    },
  },
});
