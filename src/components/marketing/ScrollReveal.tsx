import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { startMarketingReveal } from "@/lib/marketing-reveal";

/**
 * Marketing sections below the first one rise in as they scroll into view.
 * Visible by default; see `startMarketingReveal` for the safety rules.
 */
export function ScrollReveal() {
  const { pathname } = useLocation();

  useEffect(() => {
    return startMarketingReveal({
      root: document.documentElement,
      sections: [...document.querySelectorAll<HTMLElement>("main > section")].slice(1),
      innerHeight: window.innerHeight,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      ...(typeof IntersectionObserver === "function"
        ? {
            createObserver: (cb) =>
              new IntersectionObserver(
                (entries) => cb(entries.map((e) => ({ isIntersecting: e.isIntersecting, target: e.target as HTMLElement }))),
                { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
              ),
          }
        : {}),
      setTimeout: (cb, ms) => window.setTimeout(cb, ms), // DevSkim: ignore DS172411 -- Fixed callback and constant delay; no untrusted data.
      clearTimeout: (h) => window.clearTimeout(h as number),
      onBeforePrint: (cb) => {
        window.addEventListener("beforeprint", cb);
        return () => window.removeEventListener("beforeprint", cb);
      },
    });
  }, [pathname]);

  return null;
}
