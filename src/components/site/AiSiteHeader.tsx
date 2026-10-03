import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { CompositionRenderer } from "@/components/site/CompositionRenderer";
import type { CompositionTree } from "@/lib/builder/composition-tree";
import { stripBusinessSuffix } from "@/lib/website-content";

/**
 * Sol's menu bar, made usable on phones. Wide screens show Sol's design as is.
 * Phones get a compact bar with the business name and a menu button that opens
 * Sol's full design, so a long list of links never fills the first screen.
 */
export function AiSiteHeader(props: {
  tree: CompositionTree;
  name: string;
  homeHref: string;
  resolveHref: (href: string) => string;
  surface?: string | null;
  /** The owner's uploaded logo (already a usable URL), shown beside the menu. */
  logoUrl?: string | null;
}) {
  const logo = props.logoUrl && /^(https:\/\/|\/)/i.test(props.logoUrl) ? props.logoUrl : null;
  const linkLabel = (text: string) => stripBusinessSuffix(text, props.name);
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    // Turning the phone sideways (or widening the window) hides the phone
    // menu; it must also close, or the page stays unable to scroll.
    const wide = window.matchMedia("(min-width: 768px)");
    const onWide = () => wide.matches && setOpen(false);
    wide.addEventListener?.("change", onWide);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const toggle = toggleRef.current;
    return () => {
      window.removeEventListener("keydown", close);
      wide.removeEventListener?.("change", onWide);
      document.body.style.overflow = previousOverflow;
      toggle?.focus({ preventScroll: true });
    };
  }, [open]);

  return (
    <header className="rv-site-header rv-ai-header sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md pt-[env(safe-area-inset-top)]">
      <nav aria-label="Main" className="hidden md:block">
        <div className="rv-site-header-nav mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          {logo ? (
            <a href={props.homeHref} className="flex shrink-0 items-center" aria-label={`${props.name} home`}>
              <img src={logo} alt={`${props.name} logo`} className="h-10 w-auto max-w-[180px] object-contain" />
            </a>
          ) : null}
          <CompositionRenderer as="div" scope="site-header" tree={props.tree} resolveHref={props.resolveHref} surface={props.surface ?? null} linkLabel={linkLabel} />
        </div>
      </nav>
      <nav aria-label="Main" className="flex items-center justify-between gap-3 px-4 py-3 text-foreground md:hidden">
        <a href={props.homeHref} className="flex min-h-11 min-w-0 items-center gap-2 font-display text-[16px] font-semibold leading-tight tracking-tight [overflow-wrap:anywhere]">
          {logo ? <img src={logo} alt="" className="h-8 w-auto max-w-[120px] shrink-0 object-contain" /> : null}
          <span>{props.name}</span>
        </a>
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className="fixed inset-0 z-50 flex flex-col bg-background/98 p-6 pt-[calc(1.5rem+env(safe-area-inset-top))] backdrop-blur-lg md:hidden"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          <div className="flex items-center justify-end gap-3 text-foreground">
            <button
              ref={closeRef}
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto">
            <CompositionRenderer as="div" scope="site-header" tree={props.tree} resolveHref={props.resolveHref} surface={props.surface ?? null} linkLabel={linkLabel} />
          </div>
        </div>
      ) : null}
    </header>
  );
}
