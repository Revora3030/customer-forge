import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** 5-minute speed-to-lead escalation; its own failure never fails the delivery watchdog. */
async function escalate(db: never) {
  try {
    const [{ runLeadResponseEscalation }, { sendLeadAlert, leadUrlFor }] = await Promise.all([
      import("@/lib/lead-escalation.server"),
      import("@/lib/messaging.server"),
    ]);
    return await runLeadResponseEscalation(db, { sendLeadAlert: (to, data, key) => sendLeadAlert(to, data, key), leadUrlFor });
  } catch (error) {
    console.error("[lead-escalation job]", error);
    return { error: "lead-escalation failed" };
  }
}

/**
 * Every 15 minutes: confirm each new lead's owner alert was accepted by the email provider;
 * retry, flag on the owner dashboard and /admin, and log when it was not. Bearer-authenticated
 * with the cron secret; called by pg_cron (public.call_revora_job) with GitHub Actions
 * (.github/workflows/scheduled-jobs.yml) as an hourly backstop. Safe to repeat: retries reuse
 * the lead's original idempotency key. Then sends the one-time 5-minute "still waiting"
 * escalation for new leads nobody has answered (lead-escalation.server.ts), even when the
 * watchdog pass itself fails. Overlapping passes are prevented by the job_leases lease.
 */
async function handle(request: Request): Promise<Response> {
  const denied = await authenticateCronRequest(request);
  if (denied) return denied as Response;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { runLeadDeliveryWatchdogJob } = await import("@/lib/lead-delivery-watchdog.server");
  try {
    // Single-flight (pg_cron and the GitHub backstop can overlap); escalation runs even if the watchdog pass throws.
    const result = await runLeadDeliveryWatchdogJob(supabaseAdmin as never, () => escalate(supabaseAdmin as never));
    if (result.status === "busy") return Response.json({ busy: true, reason: "another lead-delivery-watchdog pass is running" });
    if (result.status === "error")
      return Response.json({ error: "lead-delivery-watchdog failed", escalation: result.escalation }, { status: 500 });
    return Response.json({ ...result.watchdog, escalation: result.escalation });
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
