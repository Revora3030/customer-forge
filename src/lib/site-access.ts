/**
 * Who may publish, and whose published site is served.
 *
 * - Paid setup, demo workspaces and Revora's own workspace: always.
 * - A workspace inside its free-access trial may publish on its Revora
 *   address, and the site is served while the trial lasts.
 * - When the trial ends without the setup payment, the site goes offline
 *   (nothing is deleted) and comes back as soon as the setup is paid.
 * Custom domains stay paid-only; see `domainUnlocked`.
 */
import { isPlatformOwnerOrg } from "@/lib/platform-owner";
import { isTrialActive, trialEndsAtMs, type TrialOrgFields } from "@/lib/trial";

export type SiteAccessOrg = TrialOrgFields & {
  id: string;
  is_demo?: boolean | null;
  is_suspended?: boolean | null;
  setup_paid_at?: string | null;
  setup_payment_status?: string | null;
};

export type SiteAccessReason = "paid" | "demo" | "owner" | "trial" | "suspended" | "setup_required";

export type SiteAccess = {
  /** The site may be published, and a published site is served to visitors. */
  live: boolean;
  /** A custom domain may be activated (setup paid, demo or owner only). */
  domainUnlocked: boolean;
  reason: SiteAccessReason;
  /** When a trial-only site goes offline, if it is live because of the trial. */
  offlineAt: string | null;
};

export function siteAccess(org: SiteAccessOrg | null | undefined): SiteAccess {
  if (!org || org.is_suspended) return { live: false, domainUnlocked: false, reason: "suspended", offlineAt: null };
  const paid = Boolean(org.setup_paid_at) || org.setup_payment_status === "paid";
  if (paid) return { live: true, domainUnlocked: true, reason: "paid", offlineAt: null };
  if (org.is_demo) return { live: true, domainUnlocked: true, reason: "demo", offlineAt: null };
  if (isPlatformOwnerOrg(org.id)) return { live: true, domainUnlocked: true, reason: "owner", offlineAt: null };
  if (isTrialActive(org)) {
    const end = trialEndsAtMs(org);
    return { live: true, domainUnlocked: false, reason: "trial", offlineAt: end === null ? null : new Date(end).toISOString() };
  }
  return { live: false, domainUnlocked: false, reason: "setup_required", offlineAt: null };
}

export const SITE_ACCESS_COLUMNS =
  "id, is_demo, is_suspended, setup_paid_at, setup_payment_status, trial_ends_at, created_at, subscription_status";
