import { canTrackAds } from "@/lib/consent";

export function openCookieSettings() {
  if (typeof window === "undefined") return;
  void canTrackAds();
  window.dispatchEvent(new Event("revora:cookie-settings"));
}
