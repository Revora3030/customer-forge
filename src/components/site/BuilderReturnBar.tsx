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
    let frame = 0;
    const measure = () => {
      frame = 0;
      setLift(bottomBarHeight(self.current));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    measure();
    // The site's sticky bar can appear after hydration or on a breakpoint
    // change, and iOS Safari resizes the viewport as its toolbar collapses
    // while the visitor scrolls, so re-measure on all of those.
    const late = window.setTimeout(measure, 1200);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    window.visualViewport?.addEventListener("resize", schedule);
    return () => {
      window.clearTimeout(late);
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
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
 * How far a bar sits from the bottom of the screen is not exact on iPhones:
 * the address bar and home-indicator padding move the visual and layout
 * viewports a few pixels apart, so "touching the bottom" allows this much slack.
 */
export const BOTTOM_PINNED_SLACK = 32;
/**
 * Known phone action bars (the composition sticky bar and the site's own
 * "Book now" bar). iOS Safari's layout viewport can sit well past the visible
 * bottom, so these are measured against the visual viewport with wider slack.
 */
export const KNOWN_BOTTOM_BARS = ".rv-cn-mobile-sticky-bar, [data-testid='site-sticky-actions']";
export const KNOWN_BAR_SLACK = 160;

/** The bottom edge getBoundingClientRect shares coordinates with. */
// eslint-disable-next-line react-refresh/only-export-components -- small pure helper kept beside its only caller so it can be tested.
export function visibleViewportBottom(
  innerHeight: number,
  visual: { offsetTop: number; height: number } | null,
): number {
  if (visual && visual.height > 0) return visual.offsetTop + visual.height;
  return innerHeight;
}

/**
 * Height a bottom-pinned bar takes up from the bottom of the screen, or 0 when
 * the box is not such a bar: it must be visible, no taller than half the
 * screen, and end within `slack` pixels of the bottom edge.
 */
// eslint-disable-next-line react-refresh/only-export-components -- small pure helper kept beside its only caller so it can be tested.
export function pinnedBarHeight(
  box: { top: number; bottom: number; width: number; height: number },
  viewportHeight: number,
  slack: number = BOTTOM_PINNED_SLACK,
): number {
  if (!box.height || !box.width || box.height > viewportHeight / 2) return 0;
  if (Math.abs(box.bottom - viewportHeight) > slack) return 0;
  return Math.max(viewportHeight - box.top, 0);
}

/**
 * Tallest visible element pinned to the bottom edge of the viewport (fixed or
 * sticky), excluding `skip`. Zero when the page has none.
 */
// eslint-disable-next-line react-refresh/only-export-components -- tiny helper kept beside its only caller.
export function bottomBarHeight(skip: Element | null, doc: Document = document, viewportHeight?: number): number {
  const visual = typeof window !== "undefined" ? window.visualViewport : null;
  const visible = viewportHeight ?? visibleViewportBottom(
    window.innerHeight,
    visual ? { offsetTop: visual.offsetTop, height: visual.height } : null,
  );
  let tallest = 0;
  for (const el of Array.from(doc.body.querySelectorAll<HTMLElement>("*"))) {
    if (el === skip || skip?.contains(el)) continue;
    const position = getComputedStyle(el).position;
    const known = el.matches(KNOWN_BOTTOM_BARS);
    if (position !== "fixed" && position !== "sticky" && !known) continue;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    tallest = Math.max(tallest, pinnedBarHeight(el.getBoundingClientRect(), visible, known ? KNOWN_BAR_SLACK : BOTTOM_PINNED_SLACK));
  }
  return Math.round(tallest);
}
