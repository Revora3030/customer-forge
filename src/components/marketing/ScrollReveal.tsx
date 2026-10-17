import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

/**
 * Marketing sections below the first one rise in as they scroll into view.
 * The page is fully visible without JavaScript and to crawlers: sections are
 * only hidden after this runs, and anything already on screen is shown at
 * once. Reduced-motion visitors get no animation (global CSS rule).
 */
export function ScrollReveal() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sections = [...document.querySelectorAll<HTMLElement>("main > section")].slice(1);
    if (!sections.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset["revealed"] = "";
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    for (const section of sections) {
      const box = section.getBoundingClientRect();
      section.dataset["reveal"] = "";
      if (box.top < window.innerHeight) section.dataset["revealed"] = "";
      else observer.observe(section);
    }
    document.documentElement.classList.add("reveal-ready");
    return () => {
      observer.disconnect();
      for (const section of sections) {
        delete section.dataset["reveal"];
        delete section.dataset["revealed"];
      }
    };
  }, [pathname]);

  return null;
}
