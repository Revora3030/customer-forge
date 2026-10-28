/**
 * Draft-preview escape hatch. When a signed-in member is looking at a draft of
 * their own website — inside the builder frame or on a shared preview link —
 * this floating control takes them straight back to the builder. It never
 * renders for visitors without a session, so shared preview links stay clean.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export function BuilderReturnBar() {
  const [signedIn, setSignedIn] = useState(false);
  const [framed, setFramed] = useState(true);
  const [hidden, setHidden] = useState(false);
  // Height of the site's own bottom-pinned bars (a mobile "Book now" bar),
  // so this control floats above them instead of covering their buttons.
  const [lift, setLift] = useState(0);
  const self = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!signedIn || framed || hidden) return;
    const measure = () => setLift(bottomBarHeight(self.current));
    measure();
    // The site's sticky bar can appear after hydration or on a breakpoint change.
    const late = window.setTimeout(measure, 1200);
    window.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(late);
      window.removeEventListener("resize", measure);
    };
  }, [signedIn, framed, hidden]);

  if (!signedIn || framed || hidden) return null;

  return (
    // Compact, dismissible, and kept out of the site's own content: bottom-left
    // on every screen (at the top it sat over the site's menu and headlines on
    // phones), above the home-indicator safe area.
    <div ref={self} className="fixed left-3 z-[60] inline-flex items-center rounded-full border border-foreground/15 bg-foreground text-background shadow-lg"
         style={{ bottom: lift ? `${lift + 12}px` : "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
    >
      {/* Client-side navigation: a full page reload here used to drop the
          builder's in-memory state (including unsaved chat) on the way back. */}
      <Link
        to="/app/website"
        className="inline-flex min-h-11 items-center gap-1.5 pl-3 pr-1.5 font-display text-[12px] font-semibold transition-opacity hover:opacity-90"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Builder
      </Link>
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

/**
 * Tallest visible element pinned to the bottom edge of the viewport (fixed or
 * sticky, reaching within a few pixels of the bottom), excluding `skip`. Zero
 * when the page has none.
 */
// eslint-disable-next-line react-refresh/only-export-components -- tiny helper kept beside its only caller.
export function bottomBarHeight(skip: Element | null, doc: Document = document, viewportHeight = window.innerHeight): number {
  let tallest = 0;
  for (const el of Array.from(doc.body.querySelectorAll<HTMLElement>("*"))) {
    if (el === skip || skip?.contains(el)) continue;
    const position = getComputedStyle(el).position;
    if (position !== "fixed" && position !== "sticky") continue;
    const box = el.getBoundingClientRect();
    if (!box.height || !box.width || box.height > viewportHeight / 2) continue;
    if (Math.abs(box.bottom - viewportHeight) > 4) continue;
    tallest = Math.max(tallest, viewportHeight - box.top);
  }
  return Math.round(tallest);
}
