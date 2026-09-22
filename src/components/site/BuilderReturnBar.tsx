/**
 * Draft-preview escape hatch. When a signed-in member is looking at a draft of
 * their own website — inside the builder frame or on a shared preview link —
 * this floating control takes them straight back to the builder. It never
 * renders for visitors without a session, so shared preview links stay clean.
 */
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function BuilderReturnBar() {
  const [signedIn, setSignedIn] = useState(false);
  const [framed, setFramed] = useState(true);

  useEffect(() => {
    // Inside the builder's own preview frame the builder is already on screen.
    setFramed(typeof window !== "undefined" && window.self !== window.top);
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

  if (!signedIn || framed) return null;

  return (
    // Explicit foreground/background pairing: the control must stay visible on
    // pale cream themes as well as dark ones, so it never inherits page ink.
    <a
      href="/app/website"
      className="fixed bottom-4 left-4 z-[60] inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-foreground px-4 py-2.5 font-display text-[13px] font-semibold text-background shadow-lg transition-opacity hover:opacity-90"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back to builder
    </a>
  );
}
