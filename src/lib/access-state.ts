/**
 * The single account-access model for Revora.
 *
 * Revora has no credit, token or per-build charge of any kind. Builder usage
 * (generation, editing, regeneration, audits, fixes, previews, rollbacks,
 * publishing) is included with the customer's access, so the ONLY question this
 * module answers is: does this workspace currently have access?
 *
 * States and their rules:
 *   TRIAL                — inside the free full-access window. Full builder access.
 *   ACTIVE_SETUP         — one-time setup fee paid. Full builder access.
 *   ACTIVE_SUBSCRIPTION  — monthly subscription active. Full builder access.
 *   PAST_DUE             — payment failed; grace access so work is never lost.
 *   CANCELED             — subscription canceled and no setup payment on file.
 *   EXPIRED              — free access ended without payment.
 *   SUSPENDED            — platform-level suspension.
 *
 * Nothing here may ever report a credit shortage as a reason.
 */
import { GROWTH_SYSTEM, usd } from "@/lib/offer";
import { isTrialActive, trialEndsAtMs, type TrialOrgFields } from "@/lib/trial";

export type AccountState =
  | "TRIAL"
  | "ACTIVE_SETUP"
  | "ACTIVE_SUBSCRIPTION"
  | "PAST_DUE"
  | "CANCELED"
  | "EXPIRED"
  | "SUSPENDED";

export type AccessOrgFields = TrialOrgFields & {
  is_demo?: boolean | null;
  is_suspended?: boolean | null;
  setup_paid_at?: string | null;
  setup_payment_status?: string | null;
};

export type AccessDecision = {
  state: AccountState;
  /** Full builder access: build, generate, edit, audit, fix, preview, save. */
  allowed: boolean;
  /** Customer-safe label for the state. */
  label: string;
  /** Customer-safe explanation. Never mentions credits or usage limits. */
  reason: string;
  /** What builder usage costs on top of access: always nothing. */
  builderUsage: "included";
  /** Free-access window end, when one applies. */
  trialEndsAt: number | null;
};

const SETUP_CALL_TO_ACTION = `Complete the ${usd(GROWTH_SYSTEM.setupPrice)} one-time setup to restore full access. Your first month of the ${usd(
  GROWTH_SYSTEM.monthlyPrice,
)}/month platform fee is free.`;

/** Builder usage is included with access — never metered, never charged per action. */
export const BUILDER_INCLUDED_LABEL = "Builder access included";
export const BUILDER_INCLUDED_DETAIL =
  "Unlimited AI website building, editing, regeneration, audits, fixes and publishing are included with your Revora access. There are no credits, tokens or per-build charges.";

export function resolveAccess(org: AccessOrgFields | null | undefined): AccessDecision {
  const trialEndsAt = trialEndsAtMs(org);
  if (!org) {
    return {
      state: "EXPIRED",
      allowed: false,
      label: "No workspace",
      reason: "We couldn't verify your workspace.",
      builderUsage: "included",
      trialEndsAt,
    };
  }
  if (org.is_suspended) {
    return {
      state: "SUSPENDED",
      allowed: false,
      label: "Suspended",
      reason: "This workspace is suspended. Contact support and we'll get you moving again.",
      builderUsage: "included",
      trialEndsAt,
    };
  }

  const setupPaid = Boolean(org.setup_paid_at) || org.setup_payment_status === "paid";
  const status = (org.subscription_status ?? "").toLowerCase();

  // Free full-access window first: status drift must never eat promised days.
  if (isTrialActive(org) && !setupPaid && status !== "active") {
    return {
      state: "TRIAL",
      allowed: true,
      label: `${GROWTH_SYSTEM.fullAccessWindow} full access`,
      reason: `Full builder access is open — build, generate, edit, audit, fix, preview and save everything. ${BUILDER_INCLUDED_DETAIL}`,
      builderUsage: "included",
      trialEndsAt,
    };
  }
  // "trialing" only means paid access when the setup fee cleared (Stripe's
  // first free month) or the free window is still open. Otherwise a brand-new
  // workspace stamped "trialing" at signup would keep access forever, which
  // would mean the free days never actually end.
  if (status === "active" || (status === "trialing" && (setupPaid || isTrialActive(org)))) {
    return {
      state: "ACTIVE_SUBSCRIPTION",
      allowed: true,
      label: "Subscription active",
      reason: `Your Revora access is active. ${BUILDER_INCLUDED_DETAIL}`,
      builderUsage: "included",
      trialEndsAt,
    };
  }
  if (status === "past_due" || status === "unpaid" || status === "incomplete") {
    return {
      state: "PAST_DUE",
      allowed: true,
      label: "Payment needs attention",
      reason: `Your last payment didn't go through, so we've kept your builder open while you update your card. ${BUILDER_INCLUDED_DETAIL}`,
      builderUsage: "included",
      trialEndsAt,
    };
  }
  // Setup paid, monthly not yet canceled: access is active. This is checked
  // AFTER the failed/canceled states so a one-time setup payment can never
  // grant permanent access once the monthly subscription stops paying.
  if (setupPaid && status !== "canceled" && status !== "cancelled") {
    return {
      state: "ACTIVE_SETUP",
      allowed: true,
      label: "Setup paid — access active",
      reason: `Your ${usd(GROWTH_SYSTEM.setupPrice)} setup is confirmed and your access is active. ${BUILDER_INCLUDED_DETAIL}`,
      builderUsage: "included",
      trialEndsAt,
    };
  }

  if (status === "canceled" || status === "cancelled") {
    return {
      state: "CANCELED",
      allowed: false,
      label: "Subscription canceled",
      reason: `Your subscription is canceled, so your work is saved but locked. ${SETUP_CALL_TO_ACTION}`,
      builderUsage: "included",
      trialEndsAt,
    };
  }
  return {
    state: "EXPIRED",
    allowed: false,
    label: "Free access ended",
    reason: `Your free access has ended and everything you built is saved. ${SETUP_CALL_TO_ACTION}`,
    builderUsage: "included",
    trialEndsAt,
  };
}
