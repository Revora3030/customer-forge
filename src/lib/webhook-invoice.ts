/**
 * Finding the workspace for a Stripe invoice that carries no workspace
 * metadata (common on renewal invoices). The stored subscription row, scoped to
 * the same Stripe environment, is the source of truth.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** The Stripe subscription id an invoice belongs to, across API versions. */
export function invoiceSubscriptionId(invoice: unknown): string | null {
  if (!invoice || typeof invoice !== "object") return null;
  const record = invoice as {
    subscription?: unknown;
    parent?: { subscription_details?: { subscription?: unknown } | null } | null;
  };
  const candidates = [record.subscription, record.parent?.subscription_details?.subscription];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && /^sub_[A-Za-z0-9]+$/.test(candidate)) return candidate;
    if (candidate && typeof candidate === "object") {
      const id = (candidate as { id?: unknown }).id;
      if (typeof id === "string" && /^sub_[A-Za-z0-9]+$/.test(id)) return id;
    }
  }
  return null;
}

/**
 * The workspace that owns a Stripe subscription in this environment, or null.
 * A sandbox subscription can never resolve to a live record and vice versa.
 * A database error throws so Stripe retries the event instead of losing it.
 */
export async function organizationForStripeSubscription(
  admin: SupabaseClient<Database>,
  subscriptionId: string | null,
  environment: "sandbox" | "live",
): Promise<string | null> {
  if (!subscriptionId) return null;
  const { data, error } = await admin
    .from("subscriptions")
    .select("organization_id")
    .eq("payment_provider", "stripe")
    .eq("provider_subscription_id", subscriptionId)
    .eq("environment", environment)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`invoice_subscription_lookup_failed:${error.code ?? error.message}`);
  return typeof data?.organization_id === "string" ? data.organization_id : null;
}
