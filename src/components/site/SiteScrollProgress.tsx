/**
 * A thin page-progress bar along the top edge of a customer site (quality bar
 * #13), in the site's own accent colour. Pure CSS scroll timeline where the
 * browser supports it; otherwise one passive scroll listener drives the same
 * bar. Decorative only (aria-hidden), never intercepts a tap, and hidden for
 * reduced-motion visitors and in print.
 *
 * With a label (premium effects, e.g. "clean" for a washing business) a small
 * meter pill also reads "41% clean" in the corner. It is text only, follows
 * the same passive listener and never takes a tap or the wheel.
 */
import { useEffect, useRef } from "react";
import { meterText, SCROLL_PROGRESS_CSS, scrollShare } from "@/lib/site-scroll-progress";
import { installSectionSettle } from "@/lib/section-settle";

export function SiteScrollProgress({ label = null }: { label?: string | null } = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const meter = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const pill = meter.current;
    if (!pill || !label || typeof window === "undefined") return;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const doc = document.documentElement;
      pill.textContent = meterText(scrollShare(window.scrollY, doc.scrollHeight, window.innerHeight), label);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [label]);
  // Desktop wheel/trackpad: settle onto a nearby section edge once scrolling stops (never traps the wheel).
  useEffect(() => (typeof window === "undefined" ? undefined : installSectionSettle(window)), []);
  useEffect(() => {
    const bar = ref.current;
    if (!bar || typeof window === "undefined") return;
    const cssDriven = typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("animation-timeline: scroll()");
    if (cssDriven) {
      bar.setAttribute("data-css", "");
      return;
    }
    let frame = 0;
    const paint = () => {
      frame = 0;
      const doc = document.documentElement;
      bar.style.setProperty("--rv-progress", String(scrollShare(window.scrollY, doc.scrollHeight, window.innerHeight)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <>
      <style>{SCROLL_PROGRESS_CSS}</style>
      <div ref={ref} className="rv-progress" aria-hidden="true" data-testid="site-scroll-progress" />
      {label ? <span ref={meter} className="rv-progress-meter" aria-hidden="true" data-testid="site-scroll-meter">{meterText(0, label)}</span> : null}
    </>
  );
}
