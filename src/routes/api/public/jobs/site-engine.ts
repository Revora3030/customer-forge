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

  // Who is holding this request open, recorded when a later attempt finds
  // this one dead. Only known invokers are kept; anything else is "unknown".
  // The database caller (pg_net) cannot set headers per call, so it names
  // itself in the query string; only known names are kept either way.
  const invokerHeader = (request.headers.get("x-revora-invoker") ?? new URL(request.url).searchParams.get("invoker") ?? "").trim().toLowerCase();
  const invoker = (["pg_net", "kick", "pump", "runner"] as const).find((name) => name === invokerHeader) ?? "unknown";

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { drainSiteEngineQueue } = await import("@/lib/site-engine.worker.server");

  const run = drainSiteEngineQueue(supabaseAdmin as never, {
    // One build slice per request (RUN_BUDGET_MS); a slice that hands back
    // asks for the next run itself. Never pile several builds behind one
    // request or override an operator pause.
    max: 1,
    invoker,
    ...(organizationId ? { organizationId } : {}),
  });
  const { keepAliveJsonResponse } = await import("@/lib/builder/keep-alive-response");
  return keepAliveJsonResponse(run, (error) => {
    console.error("[site-engine worker]", error);
    return { error: "Worker run failed" };
  });
}

export const Route = createFileRoute("/api/public/jobs/site-engine")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
    },
  },
});
