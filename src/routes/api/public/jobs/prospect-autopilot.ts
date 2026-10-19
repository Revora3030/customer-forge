import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Scheduler endpoint for the prospect autopilot (pg_cron, hourly at :17).
 * Bearer-authenticated like the site-engine worker. Returns at once while
 * autopilot is switched off; the run table keeps runs single-flight.
 */
async function handle(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied as Response;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runProspectAutopilot } = await import("@/lib/prospect-autopilot.server");
  const { runInBackground } = await import("@/lib/background");
  const { kickWorker } = await import("@/lib/site-engine.functions");
  const origin = new URL(request.url).origin;

  try {
    const result = await runProspectAutopilot(supabaseAdmin as never, {
      trigger: "cron",
      // Start each new demo build now; the 10-minute site-engine backstop
      // picks up any build this kick misses.
      onQueued: (organizationId) => runInBackground(() => kickWorker(origin, organizationId)),
    });
    return Response.json(result);
  } catch (error) {
    console.error("[prospect autopilot]", error);
    return Response.json({ error: "Autopilot run failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/jobs/prospect-autopilot")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
    },
  },
});
