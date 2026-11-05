import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * LOV-3 owner live-site monitor. Bearer-authenticated with the cron secret.
 * Does nothing unless SITE_MONITOR_MODE is "dry_run" (lists what it would send)
 * or "on". Not on a schedule yet: the Manager adds it after reading one dry-run.
 */
async function handle(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied as Response;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runSiteMonitor } = await import("@/lib/site-monitor.server");
  try {
    return Response.json(await runSiteMonitor(supabaseAdmin as never));
  } catch (error) {
    console.error("[site-monitor job]", error);
    return Response.json({ error: "site-monitor failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/jobs/site-monitor")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
    },
  },
});
