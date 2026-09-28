/**
 * Server-only subscription lifecycle side effects:
 *  - activation: welcome email, owner sale alert, workspace auto-provisioning
 *  - cancellation: grace-period messaging, win-back email, data-retention notice
 *  - plan change: proration/confirmation email
 *  - trial ending: reminder before the first monthly charge
 *  - payment failed: card-update email + in-app alert (dunning)
 * Every function is idempotent per Stripe object id via `audit_logs` markers so
 * Stripe's at-least-once webhook delivery never double-emails a customer.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";

type Admin = SupabaseClient<Database>;

const APP_URL = "https://revoragrowthsystems.com";
const PLAN_LABELS: Record<string, string> = { revora_growth_system: "Revora Growth System" };

const planLabel = (planId?: string | null) =>
  (planId && PLAN_LABELS[planId]) ||
  (planId ? planId.charAt(0).toUpperCase() + planId.slice(1) : "Revora");

const money = (cents: number | null | undefined, currency = "usd") =>
  typeof cents === "number"
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency.toUpperCase(),
      }).format(cents / 100)
    : undefined;

const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : undefined;

/** True when this lifecycle action was already performed (idempotency marker). */
async function alreadyRan(admin: Admin, marker: string): Promise<boolean> {
  const { data } = await admin
    .from("audit_logs")
    .select("id")
    .eq("entity", "billing_lifecycle")
    .eq("entity_id", marker)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

async function markRan(
  admin: Admin,
  organizationId: string,
  marker: string,
  metadata: Record<string, unknown>,
) {
  await admin.from("audit_logs").insert({
    organization_id: organizationId,
    action: "billing.lifecycle",
    entity: "billing_lifecycle",
    entity_id: marker,
    metadata: JSON.parse(JSON.stringify(metadata)),
  });
}

async function ownerContact(admin: Admin, organizationId: string) {
  const { data: membership } = await admin
    .from("memberships")
    .select("user_id")
    .eq("organization_id", organizationId)
    .in("role", ["owner", "admin"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!membership?.user_id) return { email: null as string | null, userId: null as string | null };
  const { data } = await admin.auth.admin.getUserById(membership.user_id);
  return { email: data?.user?.email ?? null, userId: membership.user_id };
}

async function orgName(admin: Admin, organizationId: string) {
  const { data } = await admin
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle();
  return data?.name ?? "your business";
}

/** Ensures the new customer lands in a ready-to-use workspace, not an empty shell. */
async function provisionWorkspace(admin: Admin, organizationId: string) {
  const { data: profile } = await admin
    .from("business_profiles")
    .select("organization_id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!profile) {
    await admin.from("business_profiles").insert({ organization_id: organizationId });
  }

  const { data: request } = await admin
    .from("website_requests")
    .select("id")
    .eq("organization_id", organizationId)
    .limit(1)
    .maybeSingle();
  if (!request) {
    const name = await orgName(admin, organizationId);
    await admin.from("website_requests").insert({
      organization_id: organizationId,
      title: `Build the ${name} website`,
      details: "Created automatically when the subscription activated.",
      kind: "new_site",
      priority: "normal",
      status: "requested",
    });
  }
}

export async function handleSubscriptionActivated(
  admin: Admin,
  input: {
    organizationId: string;
    stripeSubscriptionId: string;
    planId?: string | null;
    interval?: string | null;
    amountCents?: number | null;
    currency?: string;
    environment: string;
  },
) {
  const marker = `activated:${input.stripeSubscriptionId}`;
  if (await alreadyRan(admin, marker)) return { ran: false as const };

  await provisionWorkspace(admin, input.organizationId);

  const businessName = await orgName(admin, input.organizationId);
  const planName = planLabel(input.planId);
  const amount = money(input.amountCents, input.currency);
  const interval = input.interval === "annual" ? "annual" : "monthly";
  const templateData = {
    businessName,
    planName,
    interval,
    amount,
    billingUrl: `${APP_URL}/app/billing`,
  };

  const { email } = await ownerContact(admin, input.organizationId);
  if (email) {
    await sendTemplateEmail("billing-welcome", email, {
      templateData,
      idempotencyKey: `welcome:${input.stripeSubscriptionId}`,
    }).catch((e) => console.error("[billing] welcome email failed", (e as Error).message));
  }
  await sendTemplateEmail("billing-sale-alert", "Revorabusiness0@gmail.com", {
    templateData,
    idempotencyKey: `sale:${input.stripeSubscriptionId}`,
  }).catch((e) => console.error("[billing] sale alert failed", (e as Error).message));

  await admin.from("notifications").insert({
    organization_id: input.organizationId,
    title: `${planName} plan activated`,
    body: "Your workspace is provisioned and every plan feature is unlocked. Open the Growth Center to launch your site.",
    kind: "success",
    link: "/app",
  });

  await markRan(admin, input.organizationId, marker, {
    plan_id: input.planId ?? null,
    environment: input.environment,
  });
  return { ran: true as const };
}

export async function handleSubscriptionCanceled(
  admin: Admin,
  input: {
    organizationId: string;
    stripeSubscriptionId: string;
    accessUntil?: string | null;
    environment: string;
    /** `scheduled` = cancel_at_period_end (grace period). `ended` = subscription fully deleted. */
    phase: "scheduled" | "ended";
  },
) {
  const marker = `canceled:${input.phase}:${input.stripeSubscriptionId}`;
  if (await alreadyRan(admin, marker)) return { ran: false as const };

  const businessName = await orgName(admin, input.organizationId);
  const accessUntil = fmtDate(input.accessUntil);
  const { email } = await ownerContact(admin, input.organizationId);

  if (email) {
    await sendTemplateEmail("billing-canceled", email, {
      templateData: {
        businessName,
        accessUntil,
        billingUrl: `${APP_URL}/app/billing`,
      },
      idempotencyKey: marker,
    }).catch((e) => console.error("[billing] win-back email failed", (e as Error).message));
  }

  await admin.from("notifications").insert({
    organization_id: input.organizationId,
    title: input.phase === "scheduled" ? "Subscription set to cancel" : "Subscription ended",
    body:
      input.phase === "scheduled"
        ? `You keep full access until ${accessUntil ?? "period end"}. Your data stays safe and the workspace becomes read-only afterward — reactivate any time.`
        : "Your workspace is now read-only. Your website content, leads, and CRM data are preserved — resubscribe to pick up where you left off.",
    kind: "warning",
    link: "/app/billing",
  });

  await markRan(admin, input.organizationId, marker, { environment: input.environment });
  return { ran: true as const };
}

export async function handlePlanChanged(
  admin: Admin,
  input: {
    organizationId: string;
    stripeSubscriptionId: string;
    previousPlanId?: string | null;
    newPlanId?: string | null;
    environment: string;
  },
) {
  if (!input.newPlanId || input.previousPlanId === input.newPlanId) return { ran: false as const };
  const marker = `plan-changed:${input.stripeSubscriptionId}:${input.previousPlanId}->${input.newPlanId}`;
  if (await alreadyRan(admin, marker)) return { ran: false as const };

  const businessName = await orgName(admin, input.organizationId);
  const previousPlan = planLabel(input.previousPlanId);
  const newPlan = planLabel(input.newPlanId);
  const { email } = await ownerContact(admin, input.organizationId);

  if (email) {
    await sendTemplateEmail("billing-plan-changed", email, {
      templateData: {
        businessName,
        previousPlan,
        newPlan,
        billingUrl: `${APP_URL}/app/billing`,
      },
      idempotencyKey: marker,
    }).catch((e) => console.error("[billing] plan-change email failed", (e as Error).message));
  }

  await admin.from("notifications").insert({
    organization_id: input.organizationId,
    title: `Plan updated to ${newPlan}`,
    body: `Moved from ${previousPlan} to ${newPlan}. The change is prorated automatically and your new features are active now.`,
    kind: "success",
    link: "/app/billing",
  });

  await markRan(admin, input.organizationId, marker, {
    previous_plan_id: input.previousPlanId ?? null,
    new_plan_id: input.newPlanId,
    environment: input.environment,
  });
  return { ran: true as const };
}

/**
 * Reminder before the free month converts into the first paid month. Stripe
 * sends `customer.subscription.trial_will_end` three days ahead by default.
 * Surprise renewals are a leading cause of refunds, disputes and cancellations.
 */
export async function handleTrialWillEnd(
  admin: Admin,
  input: {
    organizationId: string;
    stripeSubscriptionId: string;
    trialEnd?: string | null;
    amountCents?: number | null;
    currency?: string;
    planId?: string | null;
    environment: string;
  },
) {
  const marker = `trial-ending:${input.stripeSubscriptionId}:${input.trialEnd ?? "unknown"}`;
  if (await alreadyRan(admin, marker)) return { ran: false as const };

  const businessName = await orgName(admin, input.organizationId);
  const chargeDate = fmtDate(input.trialEnd);
  const amount = money(input.amountCents, input.currency);
  const { email } = await ownerContact(admin, input.organizationId);

  if (email && input.environment === "live") {
    await sendTemplateEmail("billing-trial-ending", email, {
      templateData: {
        businessName,
        planName: planLabel(input.planId),
        amount,
        chargeDate,
        billingUrl: `${APP_URL}/app/billing`,
      },
      idempotencyKey: marker,
    }).catch((e) => console.error("[billing] trial-ending email failed", (e as Error).message));
  }

  await admin.from("notifications").insert({
    organization_id: input.organizationId,
    title: "Your free month is ending soon",
    body: `Your first ${amount ?? "monthly"} payment is charged ${chargeDate ? `on ${chargeDate}` : "when the free month ends"}. Update your card or plan in billing any time before then.`,
    kind: "info",
    link: "/app/billing",
  });

  await markRan(admin, input.organizationId, marker, { environment: input.environment });
  return { ran: true as const };
}

/**
 * Dunning for failed renewals. Subscription invoices do not carry workspace
 * metadata on their payment intents, so this — not `payment_intent.payment_failed`
 * — is the only reliable place to warn the customer. One email per invoice
 * attempt; Stripe's own retries each produce a new attempt count.
 */
export async function handleInvoicePaymentFailed(
  admin: Admin,
  input: {
    organizationId: string;
    invoiceId: string;
    attemptCount?: number | null;
    amountCents?: number | null;
    currency?: string;
    nextAttemptAt?: string | null;
    declineReason?: string | null;
    environment: string;
  },
) {
  const marker = `payment-failed:${input.invoiceId}:${input.attemptCount ?? 1}`;
  if (await alreadyRan(admin, marker)) return { ran: false as const };

  const businessName = await orgName(admin, input.organizationId);
  const amount = money(input.amountCents, input.currency);
  const chargeDate = fmtDate(input.nextAttemptAt);
  const declineReason = input.declineReason ? input.declineReason.slice(0, 200) : undefined;
  const { email } = await ownerContact(admin, input.organizationId);

  if (email && input.environment === "live") {
    await sendTemplateEmail("billing-payment-failed", email, {
      templateData: {
        businessName,
        amount,
        chargeDate,
        declineReason,
        billingUrl: `${APP_URL}/app/billing`,
      },
      idempotencyKey: marker,
    }).catch((e) => console.error("[billing] payment-failed email failed", (e as Error).message));
  }

  await admin.from("notifications").insert({
    organization_id: input.organizationId,
    title: "Payment failed — update your card",
    body: `We couldn't charge ${amount ?? "your subscription"}.${chargeDate ? ` We'll retry on ${chargeDate}.` : ""} Update your payment method to avoid any interruption.`,
    kind: "warning",
    link: "/app/billing",
  });

  await markRan(admin, input.organizationId, marker, {
    environment: input.environment,
    attempt: input.attemptCount ?? 1,
  });
  return { ran: true as const };
}
