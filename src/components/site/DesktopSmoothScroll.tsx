/**
 * Desktop-only smooth wheel scrolling on a published customer site (Lenis,
 * MIT). Renders only a tiny scoped stylesheet; the Lenis package is reached
 * through a dynamic import inside an effect, so it never runs on the server
 * (Workers SSR) and is never downloaded on touch, reduced motion, narrow
 * windows or inside the builder preview frame. See src/lib/smooth-scroll.ts.
 */
import { useEffect } from "react";
import { SMOOTH_SCROLL_CSS, startSmoothScroll, type SmoothScrollerFactory } from "@/lib/smooth-scroll";

const loadLenis = (): Promise<SmoothScrollerFactory> =>
  import("lenis").then(({ default: Lenis }) => (options) => new Lenis(options));

export function DesktopSmoothScroll({ enabled = true }: { enabled?: boolean } = {}) {
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    return startSmoothScroll(window, loadLenis);
  }, [enabled]);
  if (!enabled) return null;
  return <style data-rv-smooth-scroll="">{SMOOTH_SCROLL_CSS}</style>;
}
