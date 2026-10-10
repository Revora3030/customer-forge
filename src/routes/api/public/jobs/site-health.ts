import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Hourly check that the main site and every published custom domain load; emails the Revora inbox while any are down.
 * Bearer-authenticated with the cron secret and called by GitHub Actions
 * (.github/workflows/scheduled-jobs.yml). Safe to repeat: each email claims a
 * unique log row first.
 */
async function handle(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied as Response;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runSiteHealth } = await import("@/lib/owner-reports.server");
  try {
    return Response.json(await runSiteHealth(supabaseAdmin as never));
  } catch (error) {
    console.error("[site-health job]", error);
    return Response.json({ error: "site-health failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/jobs/site-health")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
    },
  },
});
