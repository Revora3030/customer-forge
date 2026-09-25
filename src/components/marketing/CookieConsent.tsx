import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  canTrackAds,
  isConsentRequiredRegion,
  updateConsent,
} from "@/lib/consent";

/**
 * Regional cookie banner for Revora's own marketing site.
 *
 * Shown only to visitors in regions that require consent and only while no
 * choice is stored. Accept and Reject are equally easy; the choice is stored,
 * recorded as evidence, and pushed to Google's consent signals. A
 * "Cookie settings" control in the footer reopens it at any time.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (typeof window === "undefined") return;
      const decided = window.localStorage.getItem("cookie_consent");
      if (decided !== null) return;
      const required = await isConsentRequiredRegion();
      if (alive && required) setVisible(true);
    })();

    const onOpenSettings = () => setVisible(true);
    window.addEventListener("revora:cookie-settings", onOpenSettings);

    // Another tab changed the choice — follow it immediately.
    const onStorage = (event: StorageEvent) => {
      if (event.key === "cookie_consent") setVisible(false);
    };
    window.addEventListener("storage", onStorage);

    return () => {
      alive = false;
      window.removeEventListener("revora:cookie-settings", onOpenSettings);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const decide = (decision: "granted" | "denied") => {
    updateConsent(decision);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie preferences"
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-xl rounded-xl border border-border bg-card p-4 shadow-lg sm:inset-x-6 sm:bottom-6"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h2 className="text-[14px] font-semibold">Cookies for measurement</h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            We use cookies to measure whether our advertising leads to trial
            signups. This never changes how the site works for you. Read more in
            our{" "}
            <a href="/privacy" className="underline underline-offset-2 hover:text-primary">
              privacy policy
            </a>
            .
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => decide("granted")}
              className="min-h-10 rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => decide("denied")}
              className="min-h-10 rounded-md border border-border px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Reject
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss without deciding"
          onClick={() => setVisible(false)}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** Re-opens the banner from anywhere (footer "Cookie settings"). */
export function openCookieSettings() {
  if (typeof window === "undefined") return;
  void canTrackAds(); // warm the region lookup for the reopened dialog
  window.dispatchEvent(new Event("revora:cookie-settings"));
}
