/**
 * Platform traffic tracking for revoragrowthsystems.com.
 *
 * Two independent layers, so a blocked third-party script never leaves Revora
 * blind:
 *  1. First-party — every public page view is written to `marketing_conversions`
 *     with first-touch attribution, and shows up in Admin → Overview.
 *  2. Google Analytics 4 — loaded only when a real measurement ID has been saved
 *     in Admin → Analytics.
 *
 * Private surfaces (`/app`, `/admin`, `/api`, tenant preview paths) are never
 * tracked: they are not marketing traffic and tenant paths must not leak into
 * platform reporting.
 */
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { trackConversion } from "@/lib/conversion";
import { isValidMeasurementId, loadGa4 } from "@/lib/ga4";
import { isPublicMarketingPath } from "@/lib/marketing-paths";
import { getPublicGaMeasurementId } from "@/lib/platform-settings.functions";

export function PlatformAnalytics() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const lastTracked = useRef<string | null>(null);

  // Load the configured GA4 property once per browser session. The ID comes
  // from the backend — the settings table itself is not publicly readable.
  // Load the configured GA4 property once per browser session. The lookup is
  // optional and must never create an unhandled rejection that can turn a
  // preview/runtime diagnostic into a page-level error.
  useEffect(() => {
    let cancelled = false;
    void getPublicGaMeasurementId()
      .then((id) => {
        if (!cancelled && isValidMeasurementId(id)) loadGa4(id);
      })
      .catch(() => {
        // Analytics is non-critical. The public app must continue rendering.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // One page_view per navigation, including client-side route changes.
  useEffect(() => {
    if (!isPublicMarketingPath(path)) return;
    if (lastTracked.current === path) return;
    lastTracked.current = path;
    trackConversion("page_view", { metadata: { path: path.slice(0, 120) } });
    if (path === "/portal") trackConversion("portal_view");
  }, [path]);

  return null;
}
