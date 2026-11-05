import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Monthly value report for the month that just ended (leads, booked work,
 * site activity and what Revora cost), one email per workspace. Called on the
 * 1st at 14:00 UTC by pg_cron through public.call_revora_job
 * (supabase/migrations/20261103110000_monthly_report_schedule.sql).
 * Bearer-authenticated with the cron secret. Safe to repeat: each email
 * claims a unique (workspace, "monthly_value", month) log row first.
 */
async function handle(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied as Response;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runMonthlyValueReports } = await import("@/lib/owner-reports.server");
  try {
    return Response.json(await runMonthlyValueReports(supabaseAdmin as never));
  } catch (error) {
    console.error("[monthly-report job]", error);
    return Response.json({ error: "monthly-report failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/jobs/monthly-report")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
    },
  },
});
