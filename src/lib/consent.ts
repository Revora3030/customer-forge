/**
 * Advertising-consent state for Revora's own marketing site.
 *
 * Chosen route: regional banner. Visitors in regions that require consent
 * (EEA, UK, Switzerland, Quebec) are asked before ad cookies are set;
 * everywhere else tracking stays enabled with no banner, honoring opt-outs.
 *
 * Two records are kept:
 * - `cookie_consent` — the plain flag that gates execution (provider contract).
 * - `revora.consent.record.v1` — the evidence: which choice, when, and which
 *   version of the notice was shown. The flag alone is not a consent record.
 */

// window.dataLayer / window.gtag types come from the existing declaration in
// src/lib/ga4.ts — do not redeclare them here.

export const STORAGE_KEY = "cookie_consent";
const RECORD_KEY = "revora.consent.record.v1";
/** Bumped whenever the notice text shown to visitors changes materially. */
export const NOTICE_VERSION = "2026-09-25";

const CONSENT_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU",
  "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES",
  "SE", "IS", "LI", "NO", "GB", "CH", "CA",
];

let consentRegion: Promise<boolean> | undefined;

export function isConsentRequiredRegion(): Promise<boolean> {
  return (consentRegion ??= lookupConsentRegion());
}

async function lookupConsentRegion(): Promise<boolean> {
  try {
    const res = await fetch("/cdn-cgi/trace", { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return true;
    const country = (await res.text()).match(/^loc=([A-Z0-9]{2})$/m)?.[1];
    // Unknown (XX) and Tor (T1) are treated as consent regions: the safe default.
    if (!country || country === "XX" || country === "T1") return true;
    return CONSENT_COUNTRIES.includes(country);
  } catch {
    return true;
  }
}

export function hasAdConsent(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) === "granted";
}

export async function canTrackAds(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const choice = window.localStorage.getItem(STORAGE_KEY);
  if (choice !== null) return choice === "granted";
  const required = await isConsentRequiredRegion();
  const latest = window.localStorage.getItem(STORAGE_KEY);
  return latest !== null ? latest === "granted" : !required;
}

/** Persists the choice, its evidence, and pushes it to Google's consent signals. */
export function updateConsent(decision: "granted" | "denied") {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, decision);
    window.localStorage.setItem(
      RECORD_KEY,
      JSON.stringify({
        choice: decision,
        updatedAt: new Date().toISOString(),
        noticeVersion: NOTICE_VERSION,
        notice:
          "Cookie notice: we use cookies to measure whether our advertising leads to trial signups. Accept or reject below.",
      }),
    );
  } catch {
    /* private-mode browsers simply lose the stored choice */
  }
  if (decision === "denied") window.gtag?.("set", "user_data", null);
  window.gtag?.("consent", "update", {
    ad_storage: decision,
    ad_user_data: decision,
    ad_personalization: decision,
  });
}
