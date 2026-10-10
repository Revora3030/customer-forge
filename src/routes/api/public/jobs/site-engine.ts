import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Background worker endpoint for Revora Site Engine generation jobs.
 * Called by the scheduler (and as a non-blocking kick after a job is enqueued).
 * Bearer-authenticated; the database lease keeps concurrent runs single-flight.
 */
async function handle(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied as Response;
  const organizationId = new URL(request.url).searchParams.get("organizationId");
  if (organizationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId))
    return Response.json({ error: "Invalid workspace" }, { status: 400 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { drainSiteEngineQueue } = await import("@/lib/site-engine.worker.server");

  try {
    const result = await drainSiteEngineQueue(supabaseAdmin as never, {
      // One long-lived request per build; do not pile several multi-minute
      // builds behind the same HTTP request or override an operator pause.
      max: 1,
      ...(organizationId ? { organizationId } : {}),
    });
    return Response.json(result);
  } catch (error) {
    console.error("[site-engine worker]", error);
    return Response.json({ error: "Worker run failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/jobs/site-engine")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
    },
  },
});
