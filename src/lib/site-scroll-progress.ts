/** Styles and maths for the customer-site page-progress bar (SiteScrollProgress). */
export const SCROLL_PROGRESS_CSS = `.rv-progress{position:fixed;top:0;left:0;right:0;z-index:70;height:3px;pointer-events:none;transform-origin:0 50%;transform:scaleX(var(--rv-progress,0));background:var(--primary,currentColor);opacity:.95}
@supports (animation-timeline:scroll()){.rv-progress[data-css]{animation:rv-progress-grow linear both;animation-timeline:scroll(root block)}}
@keyframes rv-progress-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media (prefers-reduced-motion:reduce){.rv-progress{display:none}}
@media print{.rv-progress{display:none}}`;

/** 0-1 share of the page scrolled; 0 for a page that does not scroll. */
export function scrollShare(scrollTop: number, scrollHeight: number, viewport: number): number {
  const room = scrollHeight - viewport;
  if (!(room > 0)) return 0;
  return Math.min(1, Math.max(0, scrollTop / room));
}
