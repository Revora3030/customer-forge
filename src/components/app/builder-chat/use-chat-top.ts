/**
 * Measures where the builder chat starts on the page and publishes it as
 * `--builder-chat-top` on the builder workspace root.
 *
 * builder-workspace.css sizes the chat on phones as "visible height minus
 * this", so the composer sits on screen on load whatever chrome is above it
 * (app header, topbar, banners, the Chat/Preview toggle). It used to assume a
 * fixed 12rem, which on an iPhone pushed the composer below the fold.
 */
import { useEffect, type RefObject } from "react";

export function useChatTop(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    const root = el.closest<HTMLElement>("[data-revora-builder-workspace]");
    if (!root) return;
    let frame = 0;
    const measure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        // Hidden (Preview tab on phones): keep the last good value.
        if (el.offsetParent === null) return;
        const top = Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY));
        root.style.setProperty("--builder-chat-top", `${top}px`);
      });
    };
    measure();
    // Chrome above the chat changes size (a banner appears, the access strip
    // collapses): re-measure. The chat's own height doesn't move its top, so
    // this never loops.
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(document.body);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", measure);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      viewport?.removeEventListener("resize", measure);
      window.removeEventListener("resize", measure);
      root.style.removeProperty("--builder-chat-top");
    };
  }, [ref]);
}
