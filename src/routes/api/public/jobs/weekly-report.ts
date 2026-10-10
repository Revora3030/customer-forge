import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Weekly owner report of the last 7 days of leads and appointments, one email per workspace.
 * Bearer-authenticated with the cron secret and called by GitHub Actions
 * (.github/workflows/scheduled-jobs.yml). Safe to repeat: each email claims a
 * unique log row first.
 */
async function handle(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied as Response;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runWeeklyReports } = await import("@/lib/owner-reports.server");
  try {
    return Response.json(await runWeeklyReports(supabaseAdmin as never));
  } catch (error) {
    console.error("[weekly-report job]", error);
    return Response.json({ error: "weekly-report failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/jobs/weekly-report")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
    },
  },
});
