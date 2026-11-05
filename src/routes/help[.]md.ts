import { createFileRoute } from "@tanstack/react-router";
import { helpIndexMarkdown } from "@/lib/help-articles";

export const Route = createFileRoute("/help.md")({
  server: {
    handlers: {
      GET: () => new Response(helpIndexMarkdown(), { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=600" } }),
    },
  },
});
