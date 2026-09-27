import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { CompositionRenderer } from "@/components/site/CompositionRenderer";
import type { CompositionTree } from "@/lib/builder/composition-tree";

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
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", close);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="rv-site-header rv-ai-header sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md pt-[env(safe-area-inset-top)]">
      <nav aria-label="Main" className="hidden md:block">
        <CompositionRenderer as="div" scope="site-header" tree={props.tree} resolveHref={props.resolveHref} />
      </nav>
      <nav aria-label="Main" className="flex items-center justify-between gap-3 px-4 py-3 text-foreground md:hidden">
        <a href={props.homeHref} className="flex min-h-11 min-w-0 items-center font-display text-[16px] font-semibold leading-tight tracking-tight [overflow-wrap:anywhere]">
          {props.name}
        </a>
        <button
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
            <span className="min-w-0 font-display text-[16px] font-semibold leading-tight [overflow-wrap:anywhere]">{props.name}</span>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border"
            >
              <X className="size-5" />
            </button>
          </div>
          <CompositionRenderer as="div" scope="site-header" tree={props.tree} resolveHref={props.resolveHref} />
        </div>
      ) : null}
    </header>
  );
}
