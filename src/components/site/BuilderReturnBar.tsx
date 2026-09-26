/**
 * Draft-preview escape hatch. When a signed-in member is looking at a draft of
 * their own website — inside the builder frame or on a shared preview link —
 * this floating control takes them straight back to the builder. It never
 * renders for visitors without a session, so shared preview links stay clean.
 */
import { useEffect, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function BuilderReturnBar() {
  const [signedIn, setSignedIn] = useState(false);
  const [framed, setFramed] = useState(true);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // Inside the builder's own preview frame the builder is already on screen.
    setFramed(typeof window !== "undefined" && window.self !== window.top);
    try {
      setHidden(window.sessionStorage.getItem("rv-return-bar-hidden") === "1");
    } catch {
      /* storage unavailable — keep the control visible */
    }
    let active = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSignedIn(Boolean(data.session));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!signedIn || framed || hidden) return null;

  return (
    // Compact and dismissible so it never sits on top of the site's own
    // headings; explicit ink pairing keeps it legible on any theme.
    <div className="fixed bottom-24 left-3 z-[60] sm:bottom-4 inline-flex items-center rounded-full border border-foreground/15 bg-foreground text-background shadow-lg">
      <a
        href="/app/website"
        className="inline-flex min-h-11 items-center gap-1.5 pl-3.5 pr-2 font-display text-[13px] font-semibold transition-opacity hover:opacity-90"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Builder
      </a>
      <button
        type="button"
        aria-label="Hide the builder shortcut"
        onClick={() => {
          setHidden(true);
          try {
            window.sessionStorage.setItem("rv-return-bar-hidden", "1");
          } catch {
            /* ignore */
          }
        }}
        className="inline-flex size-11 items-center justify-center rounded-full opacity-70 hover:opacity-100"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
