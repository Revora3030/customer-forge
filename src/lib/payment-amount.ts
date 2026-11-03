/**
 * A $0.00 charge is not a payment. Stripe sends a paid $0 invoice for the free
 * first month, and a 100%-off promotion code makes the setup checkout $0.
 * Those are recorded as billing facts, but they never read "Payment received"
 * in a notification, the audit trail, or the admin activity feed.
 */

/** True when a money amount (dollars) is a real, positive payment. */
export function isRealPaymentAmount(amount: unknown): boolean {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return typeof value === "number" && Number.isFinite(value) && Math.round(value * 100) > 0;
}

/** Whether a "Payment received" notice/log entry may be written for a payment. */
export function shouldAnnouncePayment(status: string, amount: unknown): boolean {
  if (status !== "completed") return true; // failures and refunds are always worth a notice
  return isRealPaymentAmount(amount);
}

/**
 * A paid invoice that carried no money (after the setup line, which was already
 * recorded from its own checkout session) adds nothing new to record.
 */
export function shouldRecordPaidInvoice(recordCents: number): boolean {
  return Number.isFinite(recordCents) && recordCents > 0;
}
