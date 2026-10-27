import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Hourly retry of new-lead alert emails and lead webhooks that failed for a transient reason
 * (provider blip, rate limit, sender not ready). Bearer-authenticated with the
 * cron secret and called by GitHub Actions (.github/workflows/scheduled-jobs.yml).
 * Safe to repeat: each resend reuses the lead's original idempotency key.
 */
async function handle(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied as Response;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runLeadAlertRetries } = await import("@/lib/owner-reports.server");
  const { runLeadWebhookRetries } = await import("@/lib/lead-webhook-retry.server");
  try {
    const alerts = await runLeadAlertRetries(supabaseAdmin as never);
    // Webhooks are retried on the same pass; a failure here never hides the alert result.
    const webhooks = await runLeadWebhookRetries(supabaseAdmin as never, new URL(request.url).origin).catch((error) => {
      console.error("[lead-webhook-retry]", error);
      return { error: "lead-webhook-retry failed" };
    });
    return Response.json({ ...alerts, webhooks });
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
