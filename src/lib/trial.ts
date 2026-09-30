/**
 * Shared free-access trial resolution.
 *
 * Every new workspace gets full access for `TRIAL_DAYS` days. Some rows were
 * created with a null `trial_ends_at` (explicit null insert bypassed the column
 * default), which used to lock the client out immediately. We fall back to
 * `created_at + TRIAL_DAYS` so the client always gets the free access promised
 * on the marketing site.
 */
export const TRIAL_DAYS = 3;
const DAY_MS = 86_400_000;

export type TrialOrgFields = {
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  created_at?: string | null;
};

/**
 * Resolved trial end (ms epoch) or null when the org has no trial window.
 * The window is never shorter than `created_at + TRIAL_DAYS`, so workspaces
 * stamped under an older, shorter trial still get the promised free days.
 */
export function trialEndsAtMs(org: TrialOrgFields | null | undefined): number | null {
  if (!org) return null;
  const candidates: number[] = [];
  if (org.trial_ends_at) {
    const explicit = new Date(org.trial_ends_at).getTime();
    if (Number.isFinite(explicit)) candidates.push(explicit);
  }
  if (org.created_at) {
    const created = new Date(org.created_at).getTime();
    if (Number.isFinite(created)) candidates.push(created + TRIAL_DAYS * DAY_MS);
  }
  return candidates.length ? Math.max(...candidates) : null;
}

export function isTrialActive(org: TrialOrgFields | null | undefined): boolean {
  if (!org) return false;
  // Any workspace inside its free-access window gets access, whatever the
  // subscription status says. Status drift (a webhook marking a brand-new org
  // past_due/canceled, or a null status) must never eat the promised free days.
  const end = trialEndsAtMs(org);
  return end !== null && end >= Date.now();
}

export function trialHoursLeft(org: TrialOrgFields | null | undefined): number {
  const end = trialEndsAtMs(org);
  if (!isTrialActive(org) || end === null) return 0;
  return Math.max(1, Math.ceil((end - Date.now()) / 3_600_000));
}

/** Fresh trial window for newly provisioned workspaces. */
export function newTrialEndsAt(from: Date = new Date()): string {
  return new Date(from.getTime() + TRIAL_DAYS * DAY_MS).toISOString();
}
