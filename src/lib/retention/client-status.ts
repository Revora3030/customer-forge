/**
 * Admin client status badge: Healthy / At risk / Needs attention, with the
 * plain reasons behind it.
 *
 * A rule-based companion to the numeric customer health score (health-score.ts),
 * built only from facts the admin client list already has: whether the site is
 * published, leads in the last 14 days, the subscription state, a trial about
 * to end and whether onboarding is finished. A fact that is not known for a
 * client (null) never raises a reason, so nothing is guessed. Pure: no I/O.
 */

export type ClientStatusLevel = "healthy" | "at_risk" | "needs_attention";

export type ClientStatusReasonCode =
  | "billing_failed"
  | "site_not_published"
  | "no_recent_leads"
  | "trial_ending"
  | "onboarding_incomplete";

export type ClientStatusReason = { code: ClientStatusReasonCode; text: string; severe: boolean };

export type ClientStatusInput = {
  now: number;
  /** Demo workspaces are not clients: no badge. */
  isDemo?: boolean | null;
  /** "published" when the site is live; anything else (draft, unpublished...) is not. Null = unknown. */
  publishState: string | null;
  /** Leads created in the last 14 days. Null = not known. */
  leadsLast14: number | null;
  /** Whole days the site has been live. Null = not live or not known. "No leads" only counts after a full window live. */
  liveDays: number | null;
  /** Subscription status from Stripe, e.g. active, trialing, past_due, unpaid. Null = none. */
  subscriptionState: string | null;
  /** End of the current period; for a trialing subscription this is when the trial ends. */
  currentPeriodEnd: string | null;
  /** Null = not known. */
  onboardingCompleted: boolean | null;
};

export type ClientStatus = {
  level: ClientStatusLevel;
  label: string;
  reasons: ClientStatusReason[];
};

export const LEADS_WINDOW_DAYS = 14;
export const TRIAL_ENDING_DAYS = 3;
const DAY = 86_400_000;

export const CLIENT_STATUS_LABELS: Record<ClientStatusLevel, string> = {
  healthy: "Healthy",
  at_risk: "At risk",
  needs_attention: "Needs attention",
};

const BILLING_FAILED = new Set(["past_due", "unpaid"]);

/**
 * Needs attention: a failed payment (past_due / unpaid), or two or more other
 * problems at once. At risk: exactly one other problem. Healthy: none.
 * Returns null for a demo workspace.
 */
export function clientStatus(input: ClientStatusInput): ClientStatus | null {
  if (input.isDemo) return null;
  const reasons: ClientStatusReason[] = [];
  const state = input.subscriptionState?.toLowerCase() ?? null;

  if (state && BILLING_FAILED.has(state)) {
    reasons.push({ code: "billing_failed", text: `Subscription is ${state.replace(/_/g, " ")}.`, severe: true });
  }

  if (input.publishState !== null && input.publishState !== "published") {
    reasons.push({ code: "site_not_published", text: "The website is not published.", severe: false });
  }

  if (
    input.leadsLast14 !== null &&
    input.leadsLast14 === 0 &&
    input.liveDays !== null &&
    input.liveDays >= LEADS_WINDOW_DAYS
  ) {
    reasons.push({ code: "no_recent_leads", text: `No leads in the last ${LEADS_WINDOW_DAYS} days.`, severe: false });
  }

  if (state === "trialing" && input.currentPeriodEnd) {
    const end = Date.parse(input.currentPeriodEnd);
    if (Number.isFinite(end)) {
      const daysLeft = Math.ceil((end - input.now) / DAY);
      if (daysLeft >= 0 && daysLeft <= TRIAL_ENDING_DAYS) {
        reasons.push({
          code: "trial_ending",
          text: daysLeft === 0 ? "Free trial ends today." : `Free trial ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`,
          severe: false,
        });
      }
    }
  }

  if (input.onboardingCompleted === false) {
    reasons.push({ code: "onboarding_incomplete", text: "Onboarding is not finished.", severe: false });
  }

  const level: ClientStatusLevel =
    reasons.some((r) => r.severe) || reasons.length >= 2
      ? "needs_attention"
      : reasons.length === 1
        ? "at_risk"
        : "healthy";
  return { level, label: CLIENT_STATUS_LABELS[level], reasons };
}
