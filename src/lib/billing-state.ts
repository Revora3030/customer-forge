/**
 * ONE source of truth for "is the setup paid?" and "what has been paid?".
 *
 * Root cause this fixes: the dashboard (/app) read the workspace columns
 * (organizations.setup_paid_at / setup_payment_status, written by the verified
 * Stripe webhook) while /app/billing looked for a completed `payments` row whose
 * description was EXACTLY "Revora Growth System setup fee". A checkout paid with
 * a promotion code is recorded as "Revora Growth System setup fee (promotion
 * code, $350.00 off)" with a $0.00 amount, so the exact match missed it:
 * dashboard "Setup paid", billing "NOT PAID YET" and "$0.00 · 1 payment".
 *
 * Both screens now call resolveSetupPaid(); the webhook-written workspace
 * columns and the setup payment row are treated as two witnesses of the same
 * fact, and any verified witness means "paid". Pure and dependency free so the
 * server function, the UI and the read-only reconcile script share it.
 */

export const SETUP_FEE_DESCRIPTION_PREFIX = "Revora Growth System setup fee";

export type SetupOrgFields = {
  setup_paid_at?: string | null;
  setup_payment_status?: string | null;
};

export type PaymentRowLike = {
  status?: string | null;
  /** Dollars (numeric column), as stored by the webhook: cents / 100. */
  amount?: number | string | null;
  description?: string | null;
  metadata?: unknown;
};

function stripeIdOf(row: PaymentRowLike): string {
  const meta = row.metadata;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const id = (meta as Record<string, unknown>)["stripe_id"];
    if (typeof id === "string") return id;
  }
  return "";
}

/** A payment row that records the one-time setup fee (full price, promo-discounted or $0). */
export function isSetupPaymentRow(row: PaymentRowLike): boolean {
  return (
    stripeIdOf(row).startsWith("setup:") ||
    String(row.description ?? "").startsWith(SETUP_FEE_DESCRIPTION_PREFIX)
  );
}

/** Dollars (possibly float) to integer cents; never drifts on sums of cents. */
export function dollarsToCents(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function orgSetupPaid(org: SetupOrgFields | null | undefined): boolean {
  return Boolean(org?.setup_paid_at) || org?.setup_payment_status === "paid";
}

export type SetupPaidSource = "workspace" | "payment" | "both" | "none";

export type SetupPaidResolution = {
  setupPaid: boolean;
  source: SetupPaidSource;
  /** Exactly one witness says paid: worth a reconcile flag, never shown as unpaid. */
  witnessesDisagree: boolean;
  /** The recorded setup payment was discounted down to $0 (promotion code). */
  setupFullyDiscounted: boolean;
};

export function resolveSetupPaid(input: {
  org?: SetupOrgFields | null;
  payments?: PaymentRowLike[] | null;
}): SetupPaidResolution {
  const fromOrg = orgSetupPaid(input.org);
  const setupRows = (input.payments ?? []).filter(
    (p) => p.status === "completed" && isSetupPaymentRow(p),
  );
  const fromPayment = setupRows.length > 0;
  return {
    setupPaid: fromOrg || fromPayment,
    source: fromOrg && fromPayment ? "both" : fromOrg ? "workspace" : fromPayment ? "payment" : "none",
    witnessesDisagree: fromOrg !== fromPayment,
    setupFullyDiscounted: setupRows.length > 0 && setupRows.every((p) => dollarsToCents(p.amount) === 0),
  };
}

/** Completed payments only: count and integer-cent total (refunds etc. are not "paid"). */
export function summarizePayments(rows: PaymentRowLike[] | null | undefined): {
  paidCount: number;
  paidCents: number;
} {
  const paid = (rows ?? []).filter((p) => p.status === "completed");
  return { paidCount: paid.length, paidCents: paid.reduce((s, p) => s + dollarsToCents(p.amount), 0) };
}
