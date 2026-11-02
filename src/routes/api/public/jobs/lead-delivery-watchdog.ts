import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Every 5 minutes: confirm each new lead's owner alert was accepted by the email provider;
 * retry, flag on the owner dashboard and /admin, and log when it was not. Bearer-authenticated
 * with the cron secret; called by pg_cron (public.call_revora_job) with GitHub Actions
 * (.github/workflows/scheduled-jobs.yml) as an hourly backstop. Safe to repeat: retries reuse
 * the lead's original idempotency key.
 */
async function handle(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied as Response;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runLeadDeliveryWatchdog } = await import("@/lib/lead-delivery-watchdog.server");
  try {
    return Response.json(await runLeadDeliveryWatchdog(supabaseAdmin as never));
  } catch (error) {
    console.error("[lead-delivery-watchdog job]", error);
    return Response.json({ error: "lead-delivery-watchdog failed" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/public/jobs/lead-delivery-watchdog")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      GET: ({ request }) => handle(request),
    },
  },
});
