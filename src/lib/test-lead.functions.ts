import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { alertRecipient } from "@/lib/lead-alert-recipient";
import { TEST_LEAD_MESSAGE, TEST_LEAD_NAME, TEST_LEAD_SOURCE } from "@/lib/test-lead";

/** Most test leads one workspace can send per minute. */
const COOLDOWN_MS = 60_000;

/**
 * Add one labeled test lead to the owner's own dashboard.
 *
 * It runs as the signed-in owner, so workspace access is enforced by RLS. It
 * does NOT email or text the "customer" (there is none), does not call the
 * workspace's lead webhook, and does not start follow-up automations. The only
 * message sent is the owner's normal new-lead alert, to the notification inbox
 * they already set up, and it says plainly that it is a test.
 */
export const sendTestLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({
    organizationId: String(input?.organizationId ?? ""),
  }))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const orgId = data.organizationId;
    if (!/^[0-9a-f-]{36}$/i.test(orgId)) throw new Error("Choose a workspace first.");

    const { data: org, error: orgError } = await db
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();
    if (orgError || !org) throw new Error("You don't have access to that workspace.");

    const since = new Date(Date.now() - COOLDOWN_MS).toISOString();
    const { count: recent } = await db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("source", TEST_LEAD_SOURCE)
      .gte("created_at", since);
    if ((recent ?? 0) > 0) throw new Error("A test lead was just sent. Give it a minute, then try again.");

    const { data: lead, error } = await db
      .from("leads")
      .insert({
        organization_id: orgId,
        name: TEST_LEAD_NAME,
        message: TEST_LEAD_MESSAGE,
        source: TEST_LEAD_SOURCE,
        status: "new",
        estimated_value: 0,
      } as never)
      .select("id")
      .single();
    if (error || !lead) throw new Error("Couldn't add the test lead. Please try again.");
    const leadId = String((lead as { id: string }).id);

    // Timeline entry and in-app notification are best-effort extras.
    await db.from("lead_activities").insert({
      organization_id: orgId,
      lead_id: leadId,
      kind: "note",
      body: "Test lead sent from the setup checklist. Not a real customer.",
      metadata: { test: true } as never,
    } as never);
    await db.from("notifications").insert({
      organization_id: orgId,
      title: "Test lead received (not a real customer)",
      body: "Your lead alerts work. Real leads show up here the same way.",
      kind: "lead",
      link: "/app/leads",
    } as never);

    // The owner's own alert channel, only if they have one and alerts are on.
    const { data: profile } = await db
      .from("business_profiles")
      .select("notification_email, email, owner_email, notify_on_lead")
      .eq("organization_id", orgId)
      .maybeSingle();
    const to =
      (profile as { notify_on_lead?: boolean | null } | null)?.notify_on_lead === false
        ? null
        : alertRecipient((profile ?? {}) as Record<string, string | null>);
    let alertedTo: string | null = null;
    if (to) {
      const { sendLeadAlert } = await import("@/lib/messaging.server");
      const result = await sendLeadAlert(
        to,
        {
          businessName: org.name ?? "Your business",
          kind: "TEST lead (not a real customer)",
          leadName: TEST_LEAD_NAME,
          message: TEST_LEAD_MESSAGE,
        },
        `lead-alert-${leadId}`,
      );
      const { logAlertDelivery } = await import("@/lib/notifications.server");
      await logAlertDelivery(null, {
        organizationId: orgId,
        leadId,
        recipient: to,
        kind: "test_lead",
        result,
      });
      if (result.ok) alertedTo = to;
    }

    return { ok: true as const, leadId, alertedTo };
  });
