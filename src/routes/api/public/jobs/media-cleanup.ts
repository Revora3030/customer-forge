import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { methodNotAllowed } from "@/lib/method-not-allowed";

/**
 * Scheduled orphaned-media clean-up. Bearer-authenticated with the cron
 * secret. Dry run unless `?apply=1` is passed, so a scheduler can be pointed
 * at it to report first and delete only once the numbers look right.
 * POST only: it deletes files, so GET (prefetchers, link checkers, crawlers)
 * must never reach the handler.
 */
async function handle(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied as Response;
  const apply = new URL(request.url).searchParams.get("apply") === "1";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { cleanOrphanedMedia } = await import("@/lib/media-cleanup.server");
  try {
    const result = await cleanOrphanedMedia(supabaseAdmin as never, { apply });
    return Response.json(result);
  } catch (error) {
    console.error("[media cleanup worker]", error);
    return Response.json({ error: "Media clean-up failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/jobs/media-cleanup")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: () => methodNotAllowed(),
    },
  },
});
