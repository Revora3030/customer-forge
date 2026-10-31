import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { clarityAllowed, clarityIsLoaded, isClarityPath, loadClarity } from "@/lib/clarity";

/**
 * Starts Microsoft Clarity on Revora's public marketing pages, after cookie
 * consent. Renders nothing.
 *
 * Clarity keeps recording for the rest of a page session, and this is a
 * single-page app. If the visitor moves from a marketing page into a private
 * area (login, app, billing, a client site) or withdraws consent, the page is
 * reloaded so the next page starts without the Clarity script. That is the
 * only way to guarantee nothing from those pages is recorded.
 */
export function ClarityLoader() {
  const path = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    let cancelled = false;
    const start = () => {
      void loadClarity().catch(() => {
        // Heatmaps are optional. The site must never break because of them.
      });
    };
    const onConsentChanged = () => {
      if (cancelled) return;
      if (clarityIsLoaded()) {
        // Consent withdrawn after the tag loaded: drop it with a fresh page.
        void clarityAllowed().then((ok) => {
          if (!ok && !cancelled) window.location.reload();
        });
        return;
      }
      start();
    };

    if (clarityIsLoaded() && !isClarityPath(path)) {
      window.location.reload();
      return;
    }
    start();
    window.addEventListener("revora:consent-changed", onConsentChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("revora:consent-changed", onConsentChanged);
    };
  }, [path]);

  return null;
}
