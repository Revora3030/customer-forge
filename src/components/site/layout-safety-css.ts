/**
 * Layout safety for sticky chrome and small text. Mechanics only: no colour,
 * font or word comes from here beyond what the page already chose.
 *
 *  - A phone's sticky Call/Book bar never covers the last content, a focused
 *    field or an in-page anchor: the page and the scroll port both leave room
 *    for the bar's measured height (--rv-sticky-height) plus the safe area.
 *  - A sticky header never covers the copy a link or focus scrolls to: the
 *    scroll port leaves room for the header's measured height
 *    (--rv-header-height, published by AiSiteHeader).
 *  - Form placeholders and small print stay readable (the colours themselves
 *    are pulled to 4.5:1 in widgetPresentationStyle).
 */
import { CHROME_CLEARANCE_CSS } from "@/components/site/chrome-clearance";

export const STICKY_BAR_CLEARANCE =
  "calc(max(var(--rv-sticky-height,84px),84px) + 16px + env(safe-area-inset-bottom,0px))";

/**
 * Header and bar scroll-padding come from CHROME_CLEARANCE_CSS (shared with the
 * premium template); this adds the page padding, the legacy bar and the
 * per-control scroll margin on top.
 */
export const LAYOUT_SAFETY_CSS = `${CHROME_CLEARANCE_CSS}
@media (max-width:767px){
html:has([data-testid="site-sticky-actions"]),html[data-rv-sticky-bar]{scroll-padding-bottom:${STICKY_BAR_CLEARANCE}}
html:has(.rv-cn-mobile-sticky-bar,[data-testid="site-sticky-actions"]) body,html[data-rv-sticky-bar] body{padding-bottom:${STICKY_BAR_CLEARANCE}}
html:has(.rv-cn-mobile-sticky-bar,[data-testid="site-sticky-actions"]) :is(input,textarea,select,button,a,[role="combobox"]){scroll-margin-bottom:${STICKY_BAR_CLEARANCE}}
}
[data-widget] :is(input,textarea)::placeholder{color:var(--muted-foreground);opacity:1}
`;
