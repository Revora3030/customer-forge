/**
 * Which inbox gets a workspace's booking + lead alerts.
 *
 * Browser-safe and dependency-free, so the email sender, the retry sweep and the
 * Integration Center all resolve the same address in the same order. The card
 * can therefore never name a different inbox from the one that actually gets
 * the alert.
 */

export const LEAD_ALERT_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export type LeadAlertProfile = {
  notification_email?: string | null;
  email?: string | null;
  owner_email?: string | null;
  notify_on_lead?: boolean | null;
};

/** The first valid inbox in preference order, ignoring the on/off switch. */
export function alertInbox(profile: LeadAlertProfile): string | null {
  const candidate = [profile.notification_email, profile.email, profile.owner_email]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find((value) => LEAD_ALERT_EMAIL.test(value));
  return candidate ?? null;
}

/** Where alerts should go, in order of preference; null when alerts are off. */
export function alertRecipient(profile: LeadAlertProfile): string | null {
  if (profile.notify_on_lead === false) return null;
  return alertInbox(profile);
}
