/**
 * Founder alert for a payment that Revora received but could not finish.
 *
 * Two silent failure paths existed in the Stripe webhook:
 *  - a growth checkout that failed verification (unexpected prices, amount or
 *    currency mismatch, workspace mismatch, invalid waiver) was only logged, so
 *    a customer could pay and never get setup unlocked with nobody told;
 *  - an event whose processing threw stays claimed but unprocessed, so every
 *    Stripe retry answers 503 until Stripe gives up, again with nobody told.
 * Both now email the founder once per event (marker per event id, hourly cap
 * from founder-alerts). Test-mode (sandbox) events never email, matching the
 * other founder alerts. The alert never breaks the webhook response.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendFounderAlert, type FounderAlertOutcome } from "@/lib/founder-alerts.server";

type Db = { from: SupabaseClient["from"] };

export type PaymentReview = {
  /** Stripe event id (preferred) or session id; one alert per marker. */
  eventId: string;
  stage: "verification" | "processing" | "stuck";
  eventType: string;
  environment: string;
  organizationId: string | null;
  reason: string;
  resourceId?: string | null;
};

const STAGE_SUMMARY: Record<PaymentReview["stage"], string> = {
  verification:
    "A checkout was paid in Stripe but failed Revora's safety checks, so setup was NOT unlocked. Check the session in Stripe and the customer's workspace.",
  processing:
    "A Stripe event could not be processed. Stripe will retry, but retries are refused until the event is reviewed.",
  stuck:
    "Stripe is retrying an event that Revora claimed but never finished. It will keep failing until the event is reviewed.",
};

/** Error text without anything that looks like a key, email or long token. */
export function safeReason(reason: string): string {
  return reason
    .replace(/(sk|rk|pk|whsec)_[A-Za-z0-9_]+/g, "[redacted]")
    .replace(/[^\s@]+@[^\s@]+/g, "[email]")
    .slice(0, 200);
}

export async function alertPaymentNeedsReview(
  db: Db,
  review: PaymentReview,
): Promise<FounderAlertOutcome | "test_mode"> {
  if (review.environment !== "live") return "test_mode";
  return sendFounderAlert(db, {
    kind: "payment_needs_review",
    // One alert per event: a processing failure and the stuck retries that
    // follow it are the same problem.
    marker: `payment-review:${review.eventId}`,
    organizationId: review.organizationId,
    title: "A payment needs your review",
    summary: STAGE_SUMMARY[review.stage],
    rows: [
      ["Stripe event", review.eventType],
      ["Reference", review.resourceId ?? review.eventId],
      ["Workspace", review.organizationId ?? "unknown"],
      ["Reason", safeReason(review.reason)],
    ],
    link: "https://revoragrowthsystems.com/admin/payments",
  });
}
