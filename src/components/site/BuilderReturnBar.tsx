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
    // Compact, dismissible, and positioned to never overlap site content.
    // On mobile it sits below the status bar safe area at the top-right;
    // on desktop bottom-left.
    <div className="fixed right-3 z-[60] sm:top-auto sm:bottom-4 sm:left-3 inline-flex items-center rounded-full border border-foreground/15 bg-foreground text-background shadow-lg"
         style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
    >
      <a
        href="/app/website"
        className="inline-flex min-h-9 items-center gap-1.5 pl-3 pr-1.5 font-display text-[12px] font-semibold transition-opacity hover:opacity-90"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
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
        className="inline-flex size-9 items-center justify-center rounded-full opacity-70 hover:opacity-100"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
