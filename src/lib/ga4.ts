/**
 * Google Analytics 4 bridge.
 *
 * The measurement ID lives in `platform_settings` (set from Admin → Analytics),
 * not in code, so it can be changed without a deploy. Until a real `G-…` ID is
 * saved, nothing is loaded and nothing is sent — no phantom tracking.
 *
 * Revora's own first-party funnel (`marketing_conversions`) is always recorded
 * regardless of GA4, so reporting never depends on a third-party script that an
 * ad blocker may strip.
 */

type GtagArgs = [string, ...unknown[]];

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: GtagArgs) => void;
  }
}

const GA_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;

let loadedId: string | null = null;

export function isValidMeasurementId(value: unknown): value is string {
  return typeof value === "string" && GA_ID_PATTERN.test(value.trim().toUpperCase());
}

/** Injects gtag.js exactly once for a validated measurement ID. */
export function loadGa4(measurementId: string) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const id = measurementId.trim().toUpperCase();
  if (!isValidMeasurementId(id) || loadedId === id) return;
  loadedId = id;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag(...args: GtagArgs) {
    window.dataLayer!.push(args);
  };
  window.gtag("js", new Date());
  // Manual page_view so client-side route changes are counted exactly once.
  window.gtag("config", id, { send_page_view: false, anonymize_ip: true });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  // Blocked analytics (ad blockers, strict networks) must fail silently.
  script.onerror = () => {
    script.remove();
  };
  document.head.appendChild(script);
}

export function ga4IsActive() {
  return loadedId !== null;
}

export function ga4PageView(path: string, title?: string) {
  if (!loadedId || typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: window.location.href,
    page_title: title ?? document.title,
  });
}

export function ga4Event(name: string, params?: Record<string, unknown>) {
  if (!loadedId || typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", name.slice(0, 40), params ?? {});
}
