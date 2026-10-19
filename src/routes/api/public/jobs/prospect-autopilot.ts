import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Scheduler endpoint for the prospect autopilot (pg_cron, hourly at :17).
 * Bearer-authenticated like the site-engine worker. POST-only because a run
 * can build demos and send outreach; GET must remain side-effect-free.
 * Returns at once while autopilot is switched off; the run table keeps runs
 * single-flight.
 */
function noStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonNoStore(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(data, { ...init, headers });
}

async function handle(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return noStore(denied as Response);

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
    return jsonNoStore(result);
  } catch (error) {
    console.error("[prospect autopilot]", error);
    return jsonNoStore({ error: "Autopilot run failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/jobs/prospect-autopilot")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
    },
  },
});
