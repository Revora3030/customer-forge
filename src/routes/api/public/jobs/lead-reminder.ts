import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Daily reminder of leads still marked new 24h+ after arriving, one email per workspace.
 * Bearer-authenticated with the cron secret and called by GitHub Actions
 * (.github/workflows/scheduled-jobs.yml). Safe to repeat: each email claims a
 * unique log row first.
 */
async function handle(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied as Response;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runLeadReminders } = await import("@/lib/owner-reports.server");
  try {
    return Response.json(await runLeadReminders(supabaseAdmin as never));
  } catch (error) {
    console.error("[lead-reminder job]", error);
    return Response.json({ error: "lead-reminder failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/jobs/lead-reminder")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
    },
  },
});
