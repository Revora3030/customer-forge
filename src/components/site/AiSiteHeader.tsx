import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Menu, Phone, X } from "lucide-react";
import { CompositionRenderer } from "@/components/site/CompositionRenderer";
import type { CompositionTree } from "@/lib/builder/composition-tree";
import { stripBusinessSuffix } from "@/lib/website-content";
import { foldHeaderSubmenus, menuItems } from "@/lib/builder/site-chrome";
import { SiteWordmark } from "@/components/site/SiteWordmark";
import { withoutBrandText } from "@/lib/site-wordmark";

/** Slide-in for the phone menu. Skipped entirely when the visitor prefers reduced motion. */
export const MENU_MOTION_CSS =
  "@media (prefers-reduced-motion: no-preference){.rv-menu-panel{animation:rv-menu-in .22s ease-out}.rv-menu-backdrop{animation:rv-menu-fade .2s ease-out}}@keyframes rv-menu-in{from{transform:translateX(100%)}to{transform:none}}@keyframes rv-menu-fade{from{opacity:0}to{opacity:1}}";

/**
 * Sol's menu bar, made usable on phones. Wide screens show Sol's design as is.
 * Phones get a compact bar with the business name and a menu button that opens
 * a full-screen list of every menu link and action.
 *
 * The phone menu is rendered into <body>, not inside the header: the header's
 * backdrop blur makes it the containing block for fixed children, which used
 * to squeeze the "full-screen" menu into the header bar so it showed nothing.
 * It lists the menu's links plainly rather than re-rendering Sol's design,
 * because that design may hide link groups at phone width.
 */
export function AiSiteHeader(props: {
  tree: CompositionTree;
  name: string;
  homeHref: string;
  resolveHref: (href: string) => string;
  surface?: string | null;
  /** The owner's uploaded logo (already a usable URL), shown beside the menu. */
  logoUrl?: string | null;
  /** Real pages the AI-authored menu does not link to (already resolved). */
  extraLinks?: { href: string; label: string }[];
  /** The business's trade, only used to vary the wordmark's shape. */
  trade?: string | null;
  /** One-tap actions built from verified facts only (a real phone, a real contact page). */
  ctas?: { label: string; href: string; kind: "call" | "book" | "quote" | "contact" }[];
  /** The phone number exactly as the owner entered it, shown beside the Call action. */
  phone?: string | null;
}) {
  const menuId = useId();
  const extraLinks = props.extraLinks ?? [];
  const dialogRef = useRef<HTMLDivElement>(null);
  const logo = props.logoUrl && /^(https:\/\/|\/)/i.test(props.logoUrl) ? props.logoUrl : null;
  const linkLabel = (text: string) => stripBusinessSuffix(text, props.name);
  const [open, setOpen] = useState(false);
  // Sub-links render as a dropdown under their parent link, never laid into the bar.
  // Without an uploaded logo the wordmark is the brand, so the menu bar's own plain-text copy of the name is dropped.
  const tree = useMemo(() => {
    const folded = foldHeaderSubmenus(props.tree);
    return logo ? folded : withoutBrandText(folded, props.name);
  }, [props.tree, props.name, logo]);
  const items = menuItems(tree)
    .map((item) => ({ ...item, href: props.resolveHref(item.href), label: linkLabel(item.label) }))
    .filter((item) => item.href);
  const links = items.filter((item) => !item.action);
  const actions = items.filter((item) => item.action);
  const ctas = props.ctas ?? [];
  const callCta = ctas.find((cta) => cta.kind === "call") ?? null;
  // The AI's own button leads; otherwise the verified contact/booking/quote action.
  const primaryCta = actions[0] ?? ctas.find((cta) => cta.kind !== "call") ?? null;
  const otherActions = actions.slice(1).filter((item) => item.href !== callCta?.href);
  const brand = (height: number) =>
    logo ? (
      <img src={logo} alt="" className="h-8 w-auto max-w-[120px] shrink-0 object-contain" />
    ) : (
      <SiteWordmark name={props.name} trade={props.trade} height={height} />
    );
  const extraMobile = extraLinks.filter((link) => !links.some((item) => item.href === link.href));
  const closeRef = useRef<HTMLButtonElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      // Keep keyboard focus inside the open menu (it covers the whole page).
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
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
    <header className="rv-site-header rv-ai-header sticky top-0 z-40 isolate border-b border-border bg-background pt-[env(safe-area-inset-top)]">
      <nav aria-label="Main" className="hidden md:block">
        <div className="rv-site-header-nav mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          {logo ? (
            <a href={props.homeHref} className="flex shrink-0 items-center" aria-label={`${props.name} home`}>
              <img src={logo} alt={`${props.name} logo`} className="h-10 w-auto max-w-[180px] object-contain" />
            </a>
          ) : (
            <a href={props.homeHref} className="flex min-h-11 shrink-0 items-center text-foreground" aria-label={`${props.name} home`}>
              <SiteWordmark name={props.name} trade={props.trade} height={36} />
            </a>
          )}
          <CompositionRenderer as="div" scope="site-header" tree={tree} resolveHref={props.resolveHref} surface={props.surface ?? null} linkLabel={linkLabel} />
          {extraLinks.length ? (
            <ul className="ml-auto flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1">
              {extraLinks.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="inline-flex min-h-11 items-center text-[14px] font-medium hover:underline">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </nav>
      <nav aria-label="Main" className="flex items-center justify-between gap-3 px-4 py-3 text-foreground md:hidden">
        <a href={props.homeHref} aria-label={`${props.name} home`} className="flex min-h-11 min-w-0 items-center gap-2 font-display text-[16px] font-semibold leading-tight tracking-tight [overflow-wrap:anywhere]">
          {logo ? (
            <>
              {brand(32)}
              <span>{props.name}</span>
            </>
          ) : (
            <SiteWordmark name={props.name} trade={props.trade} height={32} />
          )}
        </a>
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls={menuId}
          aria-haspopup="dialog"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={dialogRef}
              id={menuId}
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              className="rv-site-mobile-menu fixed inset-0 z-[100] md:hidden"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("a")) setOpen(false);
              }}
            >
              <style>{MENU_MOTION_CSS}</style>
              <div aria-hidden="true" className="rv-menu-backdrop absolute inset-0 bg-black/55" onClick={() => setOpen(false)} />
              <div className="rv-menu-panel absolute inset-y-0 right-0 flex w-[min(88vw,22rem)] flex-col overflow-hidden bg-background p-5 pt-[calc(1.25rem+env(safe-area-inset-top))] text-foreground shadow-2xl">
                <div className="flex items-center justify-between gap-3">
                  <a href={props.homeHref} aria-label={`${props.name} home`} className="flex min-h-11 min-w-0 items-center gap-2 font-display text-[17px] font-semibold leading-tight [overflow-wrap:anywhere]">
                    {logo ? (
                      <>
                        {brand(32)}
                        <span>{props.name}</span>
                      </>
                    ) : (
                      <SiteWordmark name={props.name} trade={props.trade} height={32} />
                    )}
                  </a>
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
                {primaryCta ? (
                  <a
                    href={primaryCta.href}
                    data-testid="menu-primary-cta"
                    className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-[17px] font-semibold text-primary-foreground"
                  >
                    {primaryCta.label}
                  </a>
                ) : null}
                <nav aria-label="Menu links" className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
                  <ul className="flex flex-col divide-y divide-border">
                    <li>
                      <a href={props.homeHref} className="flex min-h-14 items-center text-[19px] font-medium">Home</a>
                    </li>
                    {[...links, ...extraMobile].filter((item) => item.href !== props.homeHref).map((item) => (
                      <li key={`${item.href}|${item.label}`}>
                        <a
                          href={item.href}
                          className={
                            "depth" in item && item.depth === 1
                              ? "flex min-h-12 items-center pl-5 text-[16px] text-muted-foreground"
                              : "flex min-h-14 items-center text-[19px] font-medium"
                          }
                        >
                          {item.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                  {otherActions.length ? (
                    <div className="mt-4 flex flex-col gap-3">
                      {otherActions.filter((item) => item.href !== primaryCta?.href).map((item) => (
                        <a
                          key={`${item.href}|${item.label}`}
                          href={item.href}
                          className="inline-flex min-h-12 items-center justify-center rounded-full border border-border px-6 text-[16px] font-semibold"
                        >
                          {item.label}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </nav>
                {callCta ? (
                  <div className="mt-3 border-t border-border pt-3 pb-[env(safe-area-inset-bottom)]">
                    <a
                      href={callCta.href}
                      data-testid="menu-call"
                      className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-border px-5 text-[16px] font-semibold"
                    >
                      <Phone className="size-4" aria-hidden="true" />
                      <span>{props.phone?.trim() ? `Call ${props.phone.trim()}` : "Call us"}</span>
                    </a>
                  </div>
                ) : null}
              </div>
            </div>,
            // Inside the site wrapper (it carries the site's colours and fonts)
            // but outside the blurred header.
            toggleRef.current?.closest(".rv-site-root") ?? document.body,
          )
        : null}
    </header>
  );
}
