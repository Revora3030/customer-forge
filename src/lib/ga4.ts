/**
 * Google Analytics 4 bridge.
 *
 * Revora's own property (G-WC1X5HWN7W) is the one GA4 ID configured on
 * production, on the single shared gtag.js load. See `ga4-ids.ts` and
 * `google-tag.ts`.
 *
 * Revora's own first-party funnel (`marketing_conversions`) is always recorded
 * regardless of GA4, so reporting never depends on a third-party script that an
 * ad blocker may strip.
 */

import { canTrackAds } from "./consent";
import { ensureGoogleTagScript, initGtag } from "./google-tag";
import { isPublicMarketingPath } from "./marketing-paths";
import { REVORA_ROOT, normalizeHost } from "./revora-address";

type GtagArgs = [string, ...unknown[]];

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: GtagArgs) => void;
  }
}

const GA_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;

/** Every GA4 property configured in this page session. */
const configuredIds = new Set<string>();

/**
 * GA4 reports production traffic only: the live revoragrowthsystems.com hosts.
 * Local dev, Lovable previews/published lovable.app URLs, the revoraweb.site
 * redirect domain and client domains never load the tag.
 */
export function isGa4ProductionHost(rawHost: string | null | undefined) {
  const host = normalizeHost(rawHost);
  return host === REVORA_ROOT || host === `www.${REVORA_ROOT}`;
}

export function isValidMeasurementId(value: unknown): value is string {
  return typeof value === "string" && GA_ID_PATTERN.test(value.trim().toUpperCase());
}

/**
 * Injects gtag.js exactly once and configures each validated measurement ID.
 * Later calls only add destinations that were not configured yet.
 */
export async function loadGa4(measurementIds: string | readonly string[]) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!isGa4ProductionHost(window.location.hostname)) return;
  if (!isPublicMarketingPath(window.location.pathname) || !(await canTrackAds())) return;
  const ids = (typeof measurementIds === "string" ? [measurementIds] : [...measurementIds])
    .map((value) => (typeof value === "string" ? value.trim().toUpperCase() : ""))
    .filter((id, index, all) => isValidMeasurementId(id) && all.indexOf(id) === index)
    .filter((id) => !configuredIds.has(id))
    // Exactly one GA4 property per page session.
    .slice(0, configuredIds.size === 0 ? 1 : 0);
  const primaryId = ids[0];
  if (primaryId === undefined) return;
  const firstLoad = configuredIds.size === 0;

  initGtag();
  for (const id of ids) {
    configuredIds.add(id);
    // Manual page_view so client-side route changes are counted exactly once.
    window.gtag("config", id, { send_page_view: false, anonymize_ip: true });
  }
  if (!firstLoad) return;

  // One shared gtag.js, injected after load or first interaction.
  ensureGoogleTagScript(primaryId);
}

export function ga4IsActive() {
  return configuredIds.size > 0;
}

/** The GA4 properties configured in this page session (for diagnostics/tests). */
export function ga4ConfiguredIds(): string[] {
  return [...configuredIds];
}

export function ga4PageView(path: string, title?: string) {
  if (configuredIds.size === 0 || typeof window === "undefined" || !window.gtag) return;
  if (window.localStorage.getItem("cookie_consent") === "denied") return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: title ?? document.title,
  });
}

export function ga4Event(name: string, params?: Record<string, unknown>) {
  if (configuredIds.size === 0 || typeof window === "undefined" || !window.gtag) return;
  if (window.localStorage.getItem("cookie_consent") === "denied") return;
  window.gtag("event", name.slice(0, 40), params ?? {});
}
