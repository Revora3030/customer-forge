/**
 * Invisible speed recorder for published customer websites.
 *
 * Measures the visitor's real experience with the browser's own performance
 * APIs and reports it once, when the page is hidden or left. Renders nothing,
 * never blocks the page, and is disabled inside builder previews so owner
 * previews cannot pollute real visitor numbers.
 */
import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { recordSiteVitals } from "@/lib/public-site.functions";
import { observeWebVitals, visitToken } from "@/lib/performance/web-vitals";

export function SiteVitals({ slug, preview = false }: { slug: string; preview?: boolean }) {
  const record = useServerFn(recordSiteVitals);

  React.useEffect(() => {
    if (preview || typeof window === "undefined") return;
    const path = window.location.pathname;
    const device =
      window.innerWidth < 768 ? "mobile" : window.innerWidth < 1024 ? "tablet" : "desktop";
    const sessionId = visitToken();
    return observeWebVitals((samples) => {
      void record({ data: { slug, path, device, sessionId, samples } }).catch(() => undefined);
    });
  }, [slug, preview, record]);

  return null;
}
