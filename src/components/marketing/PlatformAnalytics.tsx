/**
 * Platform traffic tracking for revoragrowthsystems.com.
 *
 * Two independent layers, so a blocked third-party script never leaves Revora
 * blind:
 *  1. First-party — every public page view is written to `marketing_conversions`
 *     with first-touch attribution, and shows up in Admin → Overview.
 *  2. Google Analytics 4 — Revora's own property (G-WC1X5HWN7W) on the live
 *     hosts, plus any extra ID saved in Admin → Analytics.
 *
 * Private surfaces (`/app`, `/admin`, `/api`, tenant preview paths) are never
 * tracked: they are not marketing traffic and tenant paths must not leak into
 * platform reporting.
 */
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { trackConversion } from "@/lib/conversion";
import { ga4IsActive, ga4PageView, loadGa4 } from "@/lib/ga4";
import { resolveGaMeasurementIds } from "@/lib/ga4-ids";
import { isPublicMarketingPath } from "@/lib/marketing-paths";
import { detectStaffBrowser, isStaffBrowser } from "@/lib/staff-browser";
import { getPublicGaMeasurementIds } from "@/lib/platform-settings.functions";

export function PlatformAnalytics() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const lastTracked = useRef<string | null>(null);

  // Load GA4 once per page session. The IDs come from the backend (the
  // settings table itself is not publicly readable); if that lookup fails, the
  // default property still loads. Analytics must never create an unhandled
  // rejection that can turn a preview/runtime diagnostic into a page error.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
    if (!isPublicMarketingPath(window.location.pathname)) return;
    void detectStaffBrowser()
      .then((staff) =>
        staff
          ? null
          : getPublicGaMeasurementIds().catch(() => resolveGaMeasurementIds(null)),
      )
      .then(async (ids) => {
        if (cancelled || ids === null) return;
        const wasActive = ga4IsActive();
        await loadGa4(Array.isArray(ids) && ids.length > 0 ? ids : resolveGaMeasurementIds(null));
        if (cancelled || wasActive || !ga4IsActive()) return;
        // The first page_view fires before this async lookup resolves, so GA4
        // was never loaded yet and the landing page was dropped. Send it now.
        const current = window.location.pathname;
        if (isPublicMarketingPath(current)) ga4PageView(current);
      })
      .catch(() => {
        // Analytics is non-critical. The public app must continue rendering.
      });
    };
    load();
    window.addEventListener("revora:consent-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("revora:consent-changed", load);
    };
  }, []);

  // One page_view per navigation, including client-side route changes.
  useEffect(() => {
    if (!isPublicMarketingPath(path)) return;
    if (isStaffBrowser()) return;
    if (lastTracked.current === path) return;
    lastTracked.current = path;
    trackConversion("page_view", { metadata: { path: path.slice(0, 120) } });
    if (path === "/portal") trackConversion("portal_view");
  }, [path]);

  return null;
}
