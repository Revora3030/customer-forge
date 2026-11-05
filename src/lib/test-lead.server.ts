import type { SupabaseClient } from "@supabase/supabase-js";
import { alertRecipient } from "@/lib/lead-alert-recipient";
import { TEST_LEAD_MESSAGE, TEST_LEAD_NAME, TEST_LEAD_SOURCE } from "@/lib/test-lead";

/** Most test leads one workspace can send per minute. */
const COOLDOWN_MS = 60_000;

export type TestLeadRun = {
  leadId: string;
  orgName: string;
  /** The owner's alert inbox the alert was sent to, when the provider accepted it. */
  alertedTo: string | null;
  /** The inbox an alert was attempted to (null when none is set up or alerts are off). */
  alertRecipient: string | null;
};

/**
 * Add one labeled test lead to the owner's own workspace and send the owner's
 * normal new-lead alert (to their own inbox only). `db` is the signed-in
 * owner's client, so workspace access is enforced by RLS.
 */
export async function runTestLead(
  db: SupabaseClient,
  orgId: string,
  opts: { note?: string } = {},
): Promise<TestLeadRun> {
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
    body: opts.note ?? "Test lead sent from the setup checklist. Not a real customer.",
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

  return { leadId, orgName: org.name ?? "Your business", alertedTo, alertRecipient: to };
}
