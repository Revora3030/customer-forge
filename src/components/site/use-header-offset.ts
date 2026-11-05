import { useEffect, type RefObject } from "react";

/**
 * Publishes the sticky header's real height as `--rv-header-height` on <html>,
 * which `CHROME_CLEARANCE_CSS` turns into `scroll-padding-top`. Measured, not
 * assumed: the header grows when a brand wraps to two lines or the
 * safe-area inset is non-zero. The property is removed on unmount.
 */
export function useHeaderOffset(header: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = header.current;
    if (!element) return;
    const root = document.documentElement;
    const measure = () => root.style.setProperty("--rv-header-height", `${Math.ceil(element.getBoundingClientRect().height)}px`);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty("--rv-header-height");
    };
  }, [header]);
}
