import { canTrackAds } from "@/lib/consent";

/** Advertising preferences belong to marketing/auth pages, not customer sites or workspace tools. */
export function isMarketingConsentPath(pathname: string) {
  return !/^\/(?:s|p|draft|app|admin|my|onboarding)(?:\/|$)/.test(pathname);
}

export function openCookieSettings() {
  if (typeof window === "undefined") return;
  void canTrackAds();
  window.dispatchEvent(new Event("revora:cookie-settings"));
}
