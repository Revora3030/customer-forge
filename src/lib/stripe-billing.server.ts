/**
 * Server-only Stripe bookkeeping for Revora subscriptions.
 * Subscription state and entitlements are only ever derived from verified
 * Stripe objects (webhook payloads or direct API reads) — never the client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { GROWTH_SYSTEM } from "@/lib/offer";
import type { StripeEnv } from "@/lib/stripe.server";
import { MONTHLY_PRICE_LOOKUP_KEY, SETUP_PRICE_LOOKUP_KEY } from "@/lib/stripe-catalog";

type Admin = SupabaseClient<Database>;
type SubStatus = Database["public"]["Enums"]["subscription_status"];
type Interval = Database["public"]["Enums"]["billing_interval"];

/**
 * The single Revora offer. Amounts are re-exported from `@/lib/offer` so there
 * is exactly ONE place a price can ever be defined.
 */
export const GROWTH_PLAN_ID = GROWTH_SYSTEM.planId;
export const MONTHLY_PRICE_KEY = MONTHLY_PRICE_LOOKUP_KEY;
export const SETUP_PRICE_KEY = SETUP_PRICE_LOOKUP_KEY;
export const SETUP_AMOUNT = GROWTH_SYSTEM.setupPrice;
export const MONTHLY_AMOUNT = GROWTH_SYSTEM.monthlyPrice;

/**
 * Maps a Stripe Price **lookup key** (not a Price ID) to the single plan.
 * Anything unrecognised returns null so unknown prices can never be
 * silently treated as the Revora Growth System.
 */
export function planFromPriceLookupKey(lookupKey: string | null | undefined) {
  if (!lookupKey) return null;
  if (lookupKey === MONTHLY_PRICE_KEY)
    return { planId: GROWTH_PLAN_ID, interval: "monthly" as Interval };
  if (lookupKey === SETUP_PRICE_KEY)
    return { planId: GROWTH_PLAN_ID, interval: "monthly" as Interval };
  return null;
}

/** The recurring Stripe Price *lookup key* for the single plan. */
export function monthlyPriceLookupKeyFor(planId: string): string | null {
  return planId === GROWTH_PLAN_ID ? MONTHLY_PRICE_KEY : null;
}

/**
 * Best-effort human-readable identifier for a Stripe Price: the lookup key
 * when present, else the legacy metadata id, else the raw Stripe Price ID.
 */
export function resolvePriceLookupKey(price: {
  lookup_key?: string | null;
  metadata?: Record<string, string> | null;
  id?: string;
}): string | null {
  return price?.lookup_key ?? price?.metadata?.["lovable_external_id"] ?? price?.id ?? null;
}

const STATUS_MAP: Record<string, SubStatus> = {
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  unpaid: "past_due",
  incomplete: "past_due",
  incomplete_expired: "canceled",
  canceled: "canceled",
  paused: "suspended",
};

export function mapSubscriptionStatus(stripeStatus: string): SubStatus {
  return STATUS_MAP[stripeStatus] ?? "past_due";
}

const iso = (seconds: unknown) =>
  typeof seconds === "number" && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;

/**
 * Writes a verified Stripe subscription into `subscriptions` + `organizations`.
 * Safe to call repeatedly for the same event (upsert on organization_id).
 */
/** Minimal Stripe subscription shape — fields read defensively. */
type StripeSubscription = {
  metadata?: { organizationId?: string; userId?: string; planId?: string };
  items?: { data?: Array<{ price?: unknown; current_period_start?: number; current_period_end?: number }> };
  status?: string;
  current_period_start?: number;
  current_period_end?: number;
  customer?: string | { id?: string };
  id?: string;
  cancel_at_period_end?: boolean;
  trial_start?: number;
  trial_end?: number;
};

export async function syncStripeSubscription(
  admin: Admin,
  // Raw Stripe subscription payload (webhook JSON); fields are read defensively.
  subscription: StripeSubscription,
  env: StripeEnv,
): Promise<{ ok: boolean; organizationId?: string; reason?: string; canonical?: boolean }> {
  const organizationId = subscription?.metadata?.organizationId as string | undefined;
  if (!organizationId) return { ok: false, reason: "missing_organization_metadata" };

  const item = subscription?.items?.data?.[0];
  const priceKey = item?.price ? resolvePriceLookupKey(item.price) : null;
  const mapped = planFromPriceLookupKey(priceKey);
  const status = mapSubscriptionStatus(String(subscription?.status ?? ""));
  const periodStart = iso(item?.current_period_start ?? subscription?.current_period_start);
  const periodEnd = iso(item?.current_period_end ?? subscription?.current_period_end);

  const record = {
    organization_id: organizationId,
    user_id: (subscription?.metadata?.userId as string | undefined) ?? null,
    plan_id: mapped?.planId ?? (subscription?.metadata?.planId as string | undefined) ?? null,
    status,
    billing_interval: mapped?.interval ?? ("monthly" as Interval),
    payment_provider: "stripe",
    price_id: priceKey,
    environment: env,
    provider_customer_id:
      typeof subscription?.customer === "string"
        ? subscription.customer
        : (subscription?.customer?.id ?? null),
    provider_subscription_id: subscription?.id ?? null,
    cancel_at_period_end: Boolean(subscription?.cancel_at_period_end),
    current_period_start: periodStart,
    current_period_end: periodEnd,
    trial_start: iso(subscription?.trial_start),
    trial_ends_at: iso(subscription?.trial_end),
  };

  const { error: subError } = await admin
    .from("subscriptions")
    .upsert(record, { onConflict: "organization_id,payment_provider,environment" });
  // A failed write must surface so Stripe retries — never a silent success.
  if (subError) throw new Error(`subscription_upsert_failed:${subError.code ?? subError.message}`);

  const orgStatus =
    status === "canceled" && periodEnd && new Date(periodEnd) > new Date() ? "active" : status;

  // Sandbox/test Stripe traffic is bookkept in its own `subscriptions` row and
  // stops there. It may NEVER touch the canonical production billing columns,
  // production access, or the trial -> paid conversion the funnel counts.
  if (env !== "live") {
    return { ok: true, organizationId, canonical: false };
  }

  const { error: orgError } = await admin
    .from("organizations")
    .update({
      ...(record.plan_id ? { plan_id: record.plan_id } : {}),
      subscription_status: orgStatus,
      ...(periodEnd ? { trial_ends_at: null } : {}),
    })
    .eq("id", organizationId);
  if (orgError)
    throw new Error(`organization_billing_update_failed:${orgError.code ?? orgError.message}`);

  // Authoritative trial -> paid conversion, stamped only from verified LIVE
  // Stripe state. Set once (first payment wins) so retries stay idempotent.
  if (orgStatus === "active") {
    const { error: trialError } = await admin
      .from("platform_trials")
      .update({ converted_at: new Date().toISOString() })
      .eq("organization_id", organizationId)
      .is("converted_at", null);
    if (trialError)
      throw new Error(`trial_conversion_update_failed:${trialError.code ?? trialError.message}`);
  }

  return { ok: true, organizationId, canonical: true };
}

/** Records a verified Stripe charge/invoice payment. Idempotent on the Stripe id. */
export async function recordStripeTransaction(
  admin: Admin,
  input: {
    organizationId: string;
    stripeId: string;
    amount: number;
    currency: string;
    description: string;
    status: "completed" | "failed";
    planId?: string | null;
    interval?: Interval | null;
    customerEmail?: string | null;
    environment: StripeEnv;
    periodStart?: string | null;
    periodEnd?: string | null;
  },
) {
  // Identity is always organization + provider + environment + Stripe id, so a
  // sandbox charge can never be mistaken for (or overwrite) a live one.
  const { data: existingRows, error: lookupError } = await admin
    .from("payments")
    .select("id, status")
    .eq("organization_id", input.organizationId)
    .eq("payment_provider", "stripe")
    .eq("environment", input.environment)
    .contains("metadata", { stripe_id: input.stripeId })
    .order("created_at", { ascending: false })
    .limit(1);
  if (lookupError)
    throw new Error(`payment_lookup_failed:${lookupError.code ?? lookupError.message}`);
  const existing = existingRows?.[0] ?? null;

  if (existing) {
    if (existing.status === input.status) return { inserted: false as const };
    const { error } = await admin
      .from("payments")
      .update({ status: input.status })
      .eq("id", existing.id);
    if (error) throw new Error(`payment_update_failed:${error.code ?? error.message}`);
    return { inserted: false as const };
  }

  const { error: insertError } = await admin.from("payments").insert({
    organization_id: input.organizationId,
    plan_id: input.planId ?? null,
    payment_provider: "stripe",
    environment: input.environment,
    amount: input.amount,
    currency: input.currency.toUpperCase(),
    status: input.status,
    description: input.description,
    billing_interval: input.interval ?? null,
    customer_email: input.customerEmail ?? null,
    period_start: input.periodStart ?? null,
    period_end: input.periodEnd ?? null,
    completed_at: input.status === "completed" ? new Date().toISOString() : null,
    entitlement_applied: input.status === "completed",
    metadata: { stripe_id: input.stripeId },
  });
  if (insertError)
    throw new Error(`payment_insert_failed:${insertError.code ?? insertError.message}`);

  // Customer-facing billing notices come from real (live) money only — a test
  // charge must never reach a real customer's inbox or notification feed.
  if (input.environment === "live") {
    const { error: notifyError } = await admin.from("notifications").insert({
      organization_id: input.organizationId,
      title: input.status === "completed" ? "Payment received" : "Payment failed",
      body:
        input.status === "completed"
          ? `${input.description} — ${new Intl.NumberFormat("en-US", { style: "currency", currency: input.currency.toUpperCase() }).format(input.amount)} paid.`
          : `${input.description} — the card payment did not go through. Update your payment method to keep access.`,
      kind: input.status === "completed" ? "success" : "warning",
      link: "/app/billing",
    });
    if (notifyError)
      throw new Error(`payment_notification_failed:${notifyError.code ?? notifyError.message}`);
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    organization_id: input.organizationId,
    action: `payment.${input.status}`,
    entity: "payment",
    entity_id: input.stripeId,
    metadata: {
      provider: "stripe",
      environment: input.environment,
      amount: input.amount,
      currency: input.currency,
      plan_id: input.planId ?? null,
    },
  });
  if (auditError) throw new Error(`payment_audit_failed:${auditError.code ?? auditError.message}`);

  return { inserted: true as const };
}
