import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
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
      // The banner advertises Revora's own cookies — never show it on a
      // client's published website, where none of this applies.
      const { isRevoraOwnHost } = await import("@/lib/revora-address");
      if (!isRevoraOwnHost(window.location.hostname)) return;
      // Client sites shared on Revora's own address (/s/…, /p/…) are the
      // business's website too.
      if (/^\/(s|p)\//.test(window.location.pathname)) return;
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

  // Other bottom overlays (the offer bar, Jarvis on phones) step aside while
  // the banner is open, so the screen isn't stacked with three of them.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (visible) document.documentElement.dataset["cookieBanner"] = "open";
    else delete document.documentElement.dataset["cookieBanner"];
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie preferences"
      className="fixed inset-x-3 bottom-3 z-[100] rounded-xl border border-border bg-card p-3 shadow-lg sm:inset-x-auto sm:left-6 sm:bottom-6 sm:max-w-sm sm:p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h2 className="text-[13.5px] font-semibold">Cookies for measurement</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            We measure whether our ads lead to signups. It never changes how the site works. See our{" "}
            <a href="/privacy" className="underline underline-offset-2 hover:text-primary">
              privacy policy
            </a>
            .
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => decide("granted")}
              className="min-h-11 rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => decide("denied")}
              className="min-h-11 rounded-md border border-border px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Reject
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss without deciding"
          onClick={() => setVisible(false)}
          className="grid size-11 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
