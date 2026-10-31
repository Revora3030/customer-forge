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

/** Minimal invoice line shape, read defensively across Stripe API versions. */
type InvoiceLine = {
  amount?: unknown;
  price?: unknown;
  pricing?: { price_details?: { price?: unknown } | null } | null;
};

/**
 * The Stripe Price id of an invoice line. Older API versions put the Price
 * object (or id) on `line.price`; since 2025-03-31 it lives only at
 * `line.pricing.price_details.price`.
 */
export function invoiceLinePriceId(line: unknown): string | null {
  if (!line || typeof line !== "object") return null;
  const record = line as InvoiceLine;
  const candidates = [record.price, record.pricing?.price_details?.price];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.startsWith("price_")) return candidate;
    if (candidate && typeof candidate === "object") {
      const id = (candidate as { id?: unknown }).id;
      if (typeof id === "string" && id.startsWith("price_")) return id;
    }
  }
  return null;
}

/**
 * Cents on a paid invoice that belong to the setup Price. The first
 * Growth System invoice carries the $350 setup line (plus the $0 trial month),
 * and the setup is already recorded from the verified checkout session as
 * `setup:<session id>`. Recording the full invoice too would count the same
 * $350 twice in payments and revenue reports.
 */
export function invoiceSetupCents(invoice: unknown, setupPriceId: string): number {
  if (!invoice || typeof invoice !== "object" || !setupPriceId) return 0;
  const lines = (invoice as { lines?: { data?: unknown[] } }).lines?.data ?? [];
  let cents = 0;
  for (const line of lines) {
    if (invoiceLinePriceId(line) !== setupPriceId) continue;
    const amount = (line as InvoiceLine).amount;
    if (typeof amount === "number" && amount > 0) cents += amount;
  }
  return cents;
}

/** The invoice line for the recurring monthly Price, else the first line. */
export function invoiceRecurringLine(invoice: unknown, monthlyPriceId: string): unknown {
  if (!invoice || typeof invoice !== "object") return null;
  const lines = (invoice as { lines?: { data?: unknown[] } }).lines?.data ?? [];
  return lines.find((line) => invoiceLinePriceId(line) === monthlyPriceId) ?? lines[0] ?? null;
}

/**
 * What the customer actually paid for the setup line of a checkout session, in
 * cents, before tax: the list price minus any promotion-code discount, never
 * below 0 or above the list price. A line without amounts falls back to the
 * list price (the caller has already verified the unit amount).
 */
export function checkoutSetupPaidCents(
  line: { amount_subtotal?: number | null; amount_discount?: number | null } | null | undefined,
  listCents: number,
): { cents: number; discountCents: number } {
  const subtotal = typeof line?.amount_subtotal === "number" ? line.amount_subtotal : listCents;
  const discount = typeof line?.amount_discount === "number" ? Math.max(0, line.amount_discount) : 0;
  const cents = Math.min(listCents, Math.max(0, subtotal - discount));
  return { cents, discountCents: listCents - cents };
}
