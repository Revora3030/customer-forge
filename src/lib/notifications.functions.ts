/**
 * Booking + lead notification inbox.
 *
 * Every booking or enquiry already lands in the dashboard. These functions let
 * an owner choose the inbox that gets emailed the moment one arrives, send a
 * real test alert to prove delivery works, and read the delivery history so
 * "notified" is always backed by an actual provider response.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export type AlertDelivery = {
  id: string;
  recipient: string;
  kind: string;
  status: string;
  reason: string | null;
  created_at: string;
};

/** Where alerts should go, in order of preference. */
export function alertRecipient(profile: {
  notification_email?: string | null;
  email?: string | null;
  owner_email?: string | null;
  notify_on_lead?: boolean | null;
}): string | null {
  if (profile.notify_on_lead === false) return null;
  const candidate = [profile.notification_email, profile.email, profile.owner_email]
    .map((value) => (value ?? "").trim())
    .find((value) => EMAIL.test(value));
  return candidate ?? null;
}

/** Save (or clear) the inbox that receives booking + lead alerts. */
export const saveLeadNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; email: string; enabled: boolean }) => ({
    organizationId: String(input?.organizationId ?? ""),
    email: String(input?.email ?? "").trim(),
    enabled: input?.enabled !== false,
  }))
  .handler(async ({ data, context }) => {
    if (data.email && !EMAIL.test(data.email))
      throw new Error("That doesn't look like a valid email address.");

    const { error } = await context.supabase
      .from("business_profiles")
      .update({
        notification_email: data.email || null,
        notify_on_lead: data.enabled,
      } as never)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);

    return { ok: true as const, email: data.email || null, enabled: data.enabled };
  });

/** Send a real alert email so the owner can confirm it lands in their inbox. */
export const sendTestLeadAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({
    organizationId: String(input?.organizationId ?? ""),
  }))
  .handler(async ({ data, context }) => {
    const { data: profile, error } = await context.supabase
      .from("business_profiles")
      .select("notification_email, email, owner_email, notify_on_lead")
      .eq("organization_id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error("You don't have access to that workspace.");

    const to = alertRecipient((profile ?? {}) as Record<string, string | null>);
    if (!to)
      throw new Error(
        "Add a notification email first — there's no inbox to send booking alerts to.",
      );

    const { data: org } = await context.supabase
      .from("organizations")
      .select("name")
      .eq("id", data.organizationId)
      .maybeSingle();

    const { sendLeadAlert } = await import("@/lib/messaging.server");
    const result = await sendLeadAlert(
      to,
      {
        businessName: org?.name ?? "Your business",
        kind: "Test booking alert",
        leadName: "Test Customer",
        leadEmail: "test.customer@example.com",
        leadPhone: "(555) 010-0199",
        service: "Booking notification test",
        when: new Date().toLocaleString(),
        message:
          "This is a test of your booking notifications. Real bookings arrive here the moment a customer submits your Book form.",
      },
      `notify-test-${data.organizationId}-${Date.now()}`,
    );

    const { logAlertDelivery } = await import("@/lib/notifications.server");
    await logAlertDelivery(context.supabase as never, {
      organizationId: data.organizationId,
      leadId: null,
      recipient: to,
      kind: "test",
      result,
    });

    if (!result.ok) throw new Error(`Couldn't deliver the test alert (${result.reason}).`);
    return { ok: true as const, recipient: to };
  });
