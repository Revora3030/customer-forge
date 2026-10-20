import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { HEARTBEAT_MS, skipPreviewTelemetry } from "@/lib/preview-telemetry";
import { enablePreviewTelemetry, sendPreviewEvent } from "@/lib/preview-beacon-sender";

/**
 * Counts a prospect's look at its demo preview: one view per page, then a
 * heartbeat with the visible time every 15 seconds and when the page is
 * hidden. Renders nothing. Skips the operator's own looks (signed in, inside a
 * frame, or a `?preview` link) so they never inflate the numbers.
 */
export function PreviewBeacon({ token, page }: { token: string; page: string }) {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let visibleSince: number | null = null;
    let started = false;

    const flush = () => {
      if (visibleSince === null) return;
      const now = Date.now();
      const ms = now - visibleSince;
      visibleSince = document.visibilityState === "visible" ? now : null;
      if (ms >= 1_000) sendPreviewEvent(token, "heartbeat", page, ms);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") visibleSince ??= Date.now();
      else flush();
    };

    const embedded = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

    void supabase.auth
      .getSession()
      .then(({ data }) => Boolean(data.session))
      .catch(() => false)
      .then((signedIn) => {
        if (cancelled) return;
        if (skipPreviewTelemetry({ search: window.location.search, embedded, signedIn })) {
          enablePreviewTelemetry(null);
          return;
        }
        started = true;
        enablePreviewTelemetry(token);
        sendPreviewEvent(token, "view", page);
        visibleSince = document.visibilityState === "visible" ? Date.now() : null;
        timer = setInterval(flush, HEARTBEAT_MS);
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("pagehide", flush);
      });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (started) {
        flush();
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pagehide", flush);
      }
    };
  }, [token, page]);

  return null;
}
