/**
 * Reads (never writes) the subscription's first invoice from Stripe so the
 * welcome email can state the amount actually charged for setup.
 */
import { createStripeClient, type StripeEnv } from "@/lib/stripe.server";
import { invoicePaidSummary, setupPaidLine } from "@/lib/webhook-invoice";

type InvoiceRetriever = (id: string) => Promise<unknown>;

export async function firstInvoiceSetupPaidLine(
  latestInvoice: unknown,
  env: StripeEnv,
  retrieve?: InvoiceRetriever,
): Promise<string | null> {
  try {
    if (latestInvoice && typeof latestInvoice === "object") {
      return setupPaidLine(invoicePaidSummary(latestInvoice));
    }
    if (typeof latestInvoice !== "string" || !latestInvoice) return null;
    const get: InvoiceRetriever =
      retrieve ?? ((id) => createStripeClient(env).invoices.retrieve(id) as Promise<unknown>);
    return setupPaidLine(invoicePaidSummary(await get(latestInvoice)));
  } catch (error) {
    // Unknown amount: the email says "Your setup is confirmed." and no number.
    console.error("[billing] welcome amount lookup failed", (error as Error).message);
    return null;
  }
}
