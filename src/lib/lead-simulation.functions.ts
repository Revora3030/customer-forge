import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parsePublicLeadInput } from "@/lib/public-lead-input";
import { TEST_LEAD_MESSAGE, TEST_LEAD_NAME, TEST_LEAD_SOURCE } from "@/lib/test-lead";
import { buildSimulationChecklist, simulationPassed, type SimulationRows } from "@/lib/lead-simulation";

/**
 * B12-3 "/lead-test" simulation for the owner's OWN workspace.
 *
 * 1. Runs the public lead form's field checks on the test lead (with the
 *    owner's own contact details, never a stranger's).
 * 2. Saves one TEST-labeled lead and sends the owner's normal alert to the
 *    owner's own inbox (same path as the setup checklist's test lead).
 * 3. If the owner set up a webhook, sends the test lead to it marked
 *    `test: true` and records the result like a real delivery.
 * 4. Reads the stored rows back and builds the checklist from them, including
 *    alert latency (lead created -> alert accepted).
 *
 * No customer is contacted, no follow-up automation starts, and the lead's
 * `source` keeps it out of every report and count.
 */
export const simulateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({
    organizationId: String(input?.organizationId ?? ""),
  }))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const orgId = data.organizationId;
    if (!/^[0-9a-f-]{36}$/i.test(orgId)) throw new Error("Choose a workspace first.");

    const [{ data: org }, { data: profile }] = await Promise.all([
      db.from("organizations").select("slug").eq("id", orgId).maybeSingle(),
      db
        .from("business_profiles")
        .select("notification_email, email, owner_email, phone, notify_on_lead")
        .eq("organization_id", orgId)
        .maybeSingle(),
    ]);
    if (!org) throw new Error("You don't have access to that workspace.");
    const p = (profile ?? {}) as {
      notification_email?: string | null;
      owner_email?: string | null;
      email?: string | null;
      phone?: string | null;
    };
    const ownEmail = String(p.notification_email || p.owner_email || p.email || "");
    const ownPhone = String(p.phone || "");

    let validationError: string | null = null;
    try {
      parsePublicLeadInput({
        slug: String((org as { slug?: string }).slug ?? ""),
        name: TEST_LEAD_NAME,
        ...(ownEmail ? { email: ownEmail } : {}),
        ...(ownPhone ? { phone: ownPhone } : {}),
        message: TEST_LEAD_MESSAGE,
        kind: "inquiry",
      });
    } catch (error) {
      validationError = error instanceof Error ? error.message : "Form checks failed.";
      if (!ownEmail && !ownPhone) {
        validationError = "Add your own email or phone in Settings first, so the test lead uses your details, not a stranger's.";
      }
    }

    const base: Omit<SimulationRows, "lead" | "alertLog" | "webhookLog" | "alertConfigured" | "webhookConfigured"> = {
      validationError,
      testSource: TEST_LEAD_SOURCE,
    };
    if (validationError) {
      const checks = buildSimulationChecklist({
        ...base,
        lead: null,
        alertLog: null,
        webhookLog: null,
        alertConfigured: false,
        webhookConfigured: false,
      });
      return { ok: false as const, leadId: null, checks };
    }

    const { runTestLead } = await import("@/lib/test-lead.server");
    const run = await runTestLead(db, orgId, {
      note: "Test lead sent from the /lead-test simulation. Not a real customer.",
    });

    // Owner's own webhook, if configured: same dispatcher and log table as real leads.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient;
    const [{ data: routing }, { data: signing }] = await Promise.all([
      admin.from("website_settings").select("lead_webhook_url").eq("organization_id", orgId).maybeSingle(),
      admin.from("lead_webhook_secrets").select("secret").eq("organization_id", orgId).maybeSingle(),
    ]);
    const webhookUrl = typeof routing?.lead_webhook_url === "string" ? routing.lead_webhook_url.trim() : "";
    if (webhookUrl) {
      const { buildLeadWebhookPayload, dispatchLeadWebhook } = await import("@/lib/lead-routing.server");
      const payload = {
        ...buildLeadWebhookPayload({
          organizationId: orgId,
          leadId: run.leadId,
          name: TEST_LEAD_NAME,
          email: null,
          phone: null,
          message: TEST_LEAD_MESSAGE,
          sourceUrl: "revora:lead-test",
        }),
        test: true as const,
      };
      const result = await dispatchLeadWebhook(webhookUrl, payload, (signing as { secret?: string } | null)?.secret ?? null);
      const { error: logError } = await admin.from("lead_delivery_logs").insert({
        organization_id: orgId,
        lead_id: run.leadId,
        delivery_status: result.ok ? (result.skipped ? "skipped" : "delivered") : "failed",
        http_status: result.ok ? null : result.statusCode,
        reason: result.ok ? null : result.reason,
        // A test delivery is never queued for the real-lead retry job.
        retryable: false,
        attempted_at: result.attemptedAt,
        idempotency_key: payload.idempotency_key,
      } as never);
      if (logError) console.warn("lead simulation webhook log not saved", logError.message);
    }

    // Read everything back from stored rows (as the owner, so RLS applies).
    const [{ data: lead }, { data: alertRows }, { data: hookRows }] = await Promise.all([
      db.from("leads").select("id, status, source, created_at").eq("id", run.leadId).maybeSingle(),
      db
        .from("lead_alert_log")
        .select("status, reason, recipient, created_at")
        .eq("lead_id", run.leadId)
        .order("created_at", { ascending: false })
        .limit(1),
      db
        .from("lead_delivery_logs")
        .select("delivery_status, http_status, reason, attempted_at")
        .eq("lead_id", run.leadId)
        .order("attempted_at", { ascending: false })
        .limit(1),
    ]);

    const checks = buildSimulationChecklist({
      ...base,
      lead: (lead as SimulationRows["lead"]) ?? null,
      alertLog: ((alertRows ?? [])[0] as SimulationRows["alertLog"]) ?? null,
      alertConfigured: Boolean(run.alertRecipient),
      webhookLog: ((hookRows ?? [])[0] as SimulationRows["webhookLog"]) ?? null,
      webhookConfigured: Boolean(webhookUrl),
    });
    return { ok: simulationPassed(checks), leadId: run.leadId, checks };
  });
