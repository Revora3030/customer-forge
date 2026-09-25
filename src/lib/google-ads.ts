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

import { canTrackAds, updateConsent } from "@/lib/consent";

const GOOGLE_ADS_ID = "AW-18474339242";

let loadPromise: Promise<void> | null = null;

export async function loadGoogleAds(consentModeRoute = true): Promise<void> {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  loadPromise ??= (async () => {
    // Client websites live on other hosts; the ad tag is Revora's own only.
    const { isRevoraOwnHost } = await import("@/lib/revora-address");
    if (!isRevoraOwnHost(window.location.hostname)) return;

    const allowed = await canTrackAds();
    if (!consentModeRoute && !allowed) return;
    // Keep Google's consent signals aligned with the visitor's actual choice.
    updateConsent(allowed ? "granted" : "denied");

    window.dataLayer ??= [];
    window.gtag = window.gtag || function gtag(...args: [string, ...unknown[]]) {
      window.dataLayer!.push(args);
    };
    if (document.querySelector("script[data-google-ads]")) return;
    window.gtag("js", new Date());
    window.gtag("config", GOOGLE_ADS_ID);
    const script = document.createElement("script");
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GOOGLE_ADS_ID)}`;
    script.async = true;
    script.dataset["googleAds"] = "";
    document.head.appendChild(script);
  })();
  return loadPromise;
}

/** Fires the "Free trial started" conversion once a trial genuinely starts. */
export async function trackTrialStarted(): Promise<void> {
  await loadGoogleAds(true);
  window.gtag?.("event", "conversion", {
    send_to: "AW-18474339242/mP7GCMvYgIUdEKqXoOlE",
    value: 1.0,
    currency: "USD",
  });
}
