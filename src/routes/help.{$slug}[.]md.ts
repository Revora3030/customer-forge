import { createFileRoute } from "@tanstack/react-router";
import { findHelpArticle, helpArticleMarkdown } from "@/lib/help-articles";

// Plain-markdown twin of each help article (/help/<slug>.md). Unknown slugs are a 404.
export const Route = createFileRoute("/help/{$slug}.md")({
  server: {
    handlers: {
      GET: ({ params }) => {
        const article = findHelpArticle(params.slug);
        if (!article) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
        return new Response(helpArticleMarkdown(article), { headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=600" } });
      },
    },
  },
});
