/**
 * Keeps visitors inside a draft/private preview when they click the website's
 * own menu links. Site links point at the public `/s/<slug>/...` address, which
 * only serves published sites — so in a draft they showed "Business not found".
 * In preview mode, those clicks are redirected to the same page of the preview.
 */
import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { decodeAnchor, previewDestination } from "@/lib/builder/preview-navigation";

export function PreviewLinkBridge({ slug }: { slug: string }) {
  const router = useRouter();
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const destination = previewDestination(anchor.href, window.location.href, slug);
      if (!destination) return;
      const url = new URL(destination, window.location.origin);
      event.preventDefault();
      event.stopPropagation();
      // Only scroll locally when the target is THIS page. A home-page hash
      // clicked from /services must first navigate home, even if an ID repeats.
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) {
        const id = decodeAnchor(url.hash);
        const aliases = ["contact", "contact-form", "get-quote", "get_quote", "quote-form"];
        const el = document.getElementById(id) ??
          (aliases.includes(id) ? document.getElementById("contact-form") ?? document.getElementById("contact") : null);
        if (el) {
          el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
          return;
        }
      }
      void router.navigate({ href: destination });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router, slug]);
  return null;
}
