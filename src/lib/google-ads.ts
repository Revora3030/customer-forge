/**
 * Google Ads measurement tag for Revora's own marketing site.
 *
 * Loads once, only on Revora-owned hosts (never on a client's published
 * website), and only after the Consent Mode defaults are in place. The banner
 * route uses Advanced Consent Mode: the tag loads for everyone, and Google's
 * consent signals decide what each visitor's data may do — denied visitors
 * send limited cookieless pings, accepting visitors are measured in full.
 *
 * Conversion actions (account 4879697743):
 * - "Free trial started" — AW-18474339242/mP7GCMvYgIUdEKqXoOlE
 */

import { canTrackAds, pushConsentSignal } from "@/lib/consent";
import { ensureGoogleTagScript, initGtag } from "@/lib/google-tag";
import { isPublicMarketingPath } from "@/lib/marketing-paths";

const GOOGLE_ADS_ID = "AW-18474339242";

let loadPromise: Promise<void> | null = null;

export async function loadGoogleAds(_consentModeRoute = true): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!isPublicMarketingPath(window.location.pathname) || !(await canTrackAds())) return;
  loadPromise ??= (async () => {
    // Client websites live on other hosts; the ad tag is Revora's own only.
    const { isRevoraOwnHost } = await import("@/lib/revora-address");
    if (!isRevoraOwnHost(window.location.hostname)) return;

    const allowed = await canTrackAds();
    if (!allowed) return;
    // Keep Google's consent signals aligned with the visitor's state, without
    // recording a choice the visitor never made.
    pushConsentSignal(allowed ? "granted" : "denied");

    initGtag();
    window.gtag?.("config", GOOGLE_ADS_ID);
    // Same single gtag.js as GA4 (loaded after load or first interaction).
    ensureGoogleTagScript(GOOGLE_ADS_ID);
  })();
  return loadPromise;
}

/** Fires the "Free trial started" conversion once a trial genuinely starts. */
export async function trackTrialStarted(): Promise<void> {
  if (typeof window === "undefined" || !(await canTrackAds())) return;
  await loadGoogleAds(true);
  window.gtag?.("event", "conversion", {
    send_to: "AW-18474339242/mP7GCMvYgIUdEKqXoOlE",
    value: 1.0,
    currency: "USD",
  });
}
