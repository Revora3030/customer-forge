import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * "Skip to main content" link: the first Tab stop on every Revora page, hidden until focused.
 * Lets keyboard and screen reader users jump past the header navigation. Pages keep their own
 * <main>; this gives the first one the target id and focuses it, so no route needs editing.
 */
export function SkipLink() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    // Routes render their own <main> (some after a lazy load), so tag it as soon as it exists.
    const tag = () => {
      const main = document.querySelector("main");
      if (!main) return false;
      if (!main.id) main.id = "main-content";
      return main.id === "main-content";
    };
    if (tag()) return;
    const observer = new MutationObserver(() => {
      if (tag()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);
  return (
    <a
      href="#main-content"
      onClick={(event) => {
        const main = document.querySelector("main");
        if (!main) return;
        event.preventDefault();
        if (!main.id) main.id = "main-content";
        if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
        main.style.outline = "none";
        main.focus();
        main.scrollIntoView({ block: "start" });
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
    >
      Skip to main content
    </a>
  );
}
