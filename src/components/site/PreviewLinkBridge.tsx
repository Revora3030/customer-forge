/**
 * Keeps visitors inside a draft/private preview when they click the website's
 * own menu links. Site links point at the public `/s/<slug>/...` address, which
 * only serves published sites — so in a draft they showed "Business not found".
 * In preview mode, those clicks are redirected to the same page of the preview.
 */
import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

export function PreviewLinkBridge({ slug }: { slug: string }) {
  const router = useRouter();
  useEffect(() => {
    const match = window.location.pathname.match(/^\/(draft|p)\/([^/]+)/);
    if (!match) return;
    const base = `/${match[1]}/${match[2]}`;
    const publicBase = `/s/${encodeURIComponent(slug)}`;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== "_self")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname !== publicBase && !url.pathname.startsWith(`${publicBase}/`)) return;
      event.preventDefault();
      event.stopPropagation();
      const rest = url.pathname.slice(publicBase.length).replace(/^\/home$/, "");
      if (!rest && url.hash) {
        const el = document.getElementById(url.hash.slice(1));
        if (el) { el.scrollIntoView({ behavior: "smooth" }); return; }
      }
      void router.navigate({ href: `${base}${rest}${url.search}${url.hash}` });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [router, slug]);
  return null;
}
