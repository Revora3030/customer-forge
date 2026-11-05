/**
 * One billing status for every screen.
 *
 * The dashboard (/app Status Center) and /app/billing used to read different
 * sources and could contradict each other: "Past due" + "Free access ended" on
 * one screen, "trialing, renews <a date already past>" on the other. Both now
 * derive their wording from this pure helper, and an expired date is never
 * shown as an upcoming renewal.
 */
import type { Tone } from "@/lib/domain";
import { isRealPaymentAmount } from "@/lib/payment-amount";

export type BillingSubscriptionFields = {
  status: string;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
};

export type BillingStatusInput = {
  setupPaid: boolean;
  subscription?: BillingSubscriptionFields | null;
  /** End of the no-card free-access window (ms epoch), if any. */
  freeAccessEndsAt?: number | null;
  now?: number;
};

export type BillingStatusState =
  | "active"
  | "first_month_free"
  | "renewal_pending"
  | "past_due"
  | "cancel_scheduled"
  | "canceled"
  | "setup_paid"
  | "free_access"
  | "free_access_ended"
  | "not_started";

export type BillingStatus = {
  state: BillingStatusState;
  label: string;
  tone: Tone;
  /** Label for the date below; always describes `date` truthfully. */
  dateLabel: string;
  /** ISO date that is still in the future, or null. Never a past date. */
  date: string | null;
};

function futureIso(value: string | null | undefined, now: number): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && ms > now ? new Date(ms).toISOString() : null;
}

export function deriveBillingStatus(input: BillingStatusInput): BillingStatus {
  const now = input.now ?? Date.now();
  const sub = input.subscription ?? null;
  if (sub) {
    const periodEnd = futureIso(sub.current_period_end, now);
    switch (sub.status) {
      case "past_due":
      case "unpaid":
        return {
          state: "past_due",
          label: "Past due",
          tone: "danger",
          dateLabel: "Payment needs attention",
          date: null,
        };
      case "trialing": {
        const trialEnd = futureIso(sub.trial_ends_at, now);
        // Cancelled during the free month: nothing will be charged, so never
        // show a "first monthly charge" date for it.
        if (sub.cancel_at_period_end) {
          return {
            state: "cancel_scheduled",
            label: "Cancellation scheduled",
            tone: "neutral",
            dateLabel: "Access until",
            date: trialEnd ?? periodEnd,
          };
        }
        if (trialEnd) {
          return {
            state: "first_month_free",
            label: "First month free",
            tone: "info",
            dateLabel: "First monthly charge",
            date: trialEnd,
          };
        }
        // The free month's end date has passed but the renewal hasn't been
        // confirmed yet: say so instead of showing a past "renews" date.
        return {
          state: "renewal_pending",
          label: "Renewal pending",
          tone: "attention",
          dateLabel: periodEnd ? "Next billing date" : "Free month ended",
          date: periodEnd,
        };
      }
      case "active":
        if (sub.cancel_at_period_end) {
          return {
            state: "cancel_scheduled",
            label: "Cancellation scheduled",
            tone: "neutral",
            dateLabel: "Access until",
            date: periodEnd,
          };
        }
        return {
          state: "active",
          label: "Active",
          tone: "signal",
          dateLabel: "Renews",
          date: periodEnd,
        };
      case "canceled":
        return {
          state: "canceled",
          label: "Canceled",
          tone: "neutral",
          dateLabel: periodEnd ? "Access until" : "Subscription ended",
          date: periodEnd,
        };
      default:
        break; // incomplete etc.: fall back to the setup / free-access view
    }
  }
  if (input.setupPaid) {
    return {
      state: "setup_paid",
      label: "Setup paid",
      tone: "signal",
      dateLabel: "Next billing date",
      date: null,
    };
  }
  const freeEnd = input.freeAccessEndsAt ?? null;
  if (freeEnd !== null && Number.isFinite(freeEnd)) {
    if (freeEnd > now) {
      return {
        state: "free_access",
        label: "Free access",
        tone: "info",
        dateLabel: "Free access ends",
        date: new Date(freeEnd).toISOString(),
      };
    }
    // Free access ending is not a failed payment: never call it "past due".
    return {
      state: "free_access_ended",
      label: "Free access ended",
      tone: "attention",
      dateLabel: "Pay the setup fee to launch",
      date: null,
    };
  }
  return {
    state: "not_started",
    label: "Not started",
    tone: "neutral",
    dateLabel: "Next billing date",
    date: null,
  };
}

/**
 * Only real charges are payments (uses #537's isRealPaymentAmount). A $0.00 row (for example a setup fee fully
 * covered by a promotion code) is not a payment: it is never listed, counted or
 * summed as one, and it can never make anything count as paid.
 */
export function chargedPayments<T extends { amount: number | string | null }>(
  rows: readonly T[] | null | undefined,
): { charged: T[]; hadZeroEntry: boolean } {
  const all = rows ?? [];
  const charged = all.filter((p) => isRealPaymentAmount(p.amount));
  return { charged, hadZeroEntry: charged.length !== all.length };
}
