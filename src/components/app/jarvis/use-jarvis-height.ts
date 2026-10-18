import { useEffect, type RefObject } from "react";

/**
 * Sizes the Jarvis page to the visible screen so only the conversation scrolls.
 *
 * Sets two custom properties on the root element, read by jarvis.css:
 * - --jarvis-vh: the visual viewport height (shrinks when the iOS keyboard opens);
 * - --jarvis-top: the root's distance from the top of the document (the admin
 *   header and page padding), measured instead of guessed.
 */
export function useJarvisHeight(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof window === "undefined") return;
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const top = root.getBoundingClientRect().top + window.scrollY;
        root.style.setProperty("--jarvis-top", `${Math.max(0, Math.round(top))}px`);
        root.style.setProperty("--jarvis-vh", `${Math.round(viewport?.height ?? window.innerHeight)}px`);
      });
    };
    update();
    viewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (observer && root.parentElement) observer.observe(root.parentElement);
    return () => {
      window.cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      observer?.disconnect();
      root.style.removeProperty("--jarvis-top");
      root.style.removeProperty("--jarvis-vh");
    };
  }, [ref]);
}
