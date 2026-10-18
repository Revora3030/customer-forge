import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Hourly retry of new-lead alert emails that failed for a transient reason
 * (provider blip, rate limit, sender not ready). Bearer-authenticated with the
 * cron secret and called by GitHub Actions (.github/workflows/scheduled-jobs.yml).
 * Safe to repeat: each resend reuses the lead's original idempotency key.
 */
async function handle(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied as Response;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runLeadAlertRetries } = await import("@/lib/owner-reports.server");
  try {
    return Response.json(await runLeadAlertRetries(supabaseAdmin as never));
  } catch (error) {
    console.error("[lead-alert-retry job]", error);
    return Response.json({ error: "lead-alert-retry failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/jobs/lead-alert-retry")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
    },
  },
});
