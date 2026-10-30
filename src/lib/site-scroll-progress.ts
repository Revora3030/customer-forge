/** Styles and maths for the customer-site page-progress bar (SiteScrollProgress). */
export const SCROLL_PROGRESS_CSS = `.rv-progress{position:fixed;top:0;left:0;right:0;z-index:70;height:3px;pointer-events:none;transform-origin:0 50%;transform:scaleX(var(--rv-progress,0));background:var(--primary,currentColor);opacity:.95}
@supports (animation-timeline:scroll()){.rv-progress[data-css]{animation:rv-progress-grow linear both;animation-timeline:scroll(root block)}}
@keyframes rv-progress-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media (prefers-reduced-motion:reduce){.rv-progress{display:none}}
.rv-progress-meter{position:fixed;right:12px;bottom:calc(max(var(--rv-sticky-height,0px),0px) + 12px + env(safe-area-inset-bottom,0px));z-index:70;pointer-events:none;padding:6px 12px;border-radius:999px;background:var(--primary,#111);color:var(--primary-foreground,#fff);font-size:12px;font-weight:700;letter-spacing:.02em;font-variant-numeric:tabular-nums;box-shadow:0 6px 18px rgba(0,0,0,.2)}
@media print{.rv-progress,.rv-progress-meter{display:none}}`;

/** 0-1 share of the page scrolled; 0 for a page that does not scroll. */
export function scrollShare(scrollTop: number, scrollHeight: number, viewport: number): number {
  const room = scrollHeight - viewport;
  if (!(room > 0)) return 0;
  return Math.min(1, Math.max(0, scrollTop / room));
}

/** The meter pill's words: "41% clean". */
export function meterText(share: number, label: string): string {
  return `${Math.round(Math.min(1, Math.max(0, share)) * 100)}% ${label}`;
}
