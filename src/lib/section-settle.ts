/**
 * Desktop section settle (quality bar #8) — the mouse/trackpad counterpart of
 * the touch-only chapter snap in cinematic-css.ts.
 *
 * CSS `scroll-snap-type` is deliberately not used on desktop: each wheel step
 * is smaller than the snap range of a full-screen section, so the page snapped
 * straight back and the wheel seemed stuck. Instead, once a wheel or trackpad
 * scroll has come to rest, and only when a section edge is already within a
 * short distance of the top of the screen, the page glides that last few
 * pixels so the section lines up. It never fires while the visitor is
 * scrolling, never moves further than SETTLE_MAX_PX, never on touch, keyboard
 * or scrollbar drags, and is off for reduced motion — so it can never trap the
 * wheel.
 */

/** Largest correction ever made, in CSS pixels. */
export const SETTLE_MAX_PX = 140;
/** Corrections smaller than this are not worth a movement. */
export const SETTLE_MIN_PX = 6;
/** Quiet time after the last scroll event before the page counts as at rest. */
export const SETTLE_IDLE_MS = 180;
/** A scroll only settles when a wheel event happened this recently. */
export const SETTLE_WHEEL_WINDOW_MS = 600;

/**
 * The signed distance to scroll so the nearest section edge meets the top of
 * the viewport (below a sticky header), or null when no edge is close enough.
 * `edges` are section tops relative to the viewport top, in CSS pixels.
 */
export function settleDelta(
  edges: readonly number[],
  opts: { viewportHeight: number; headerOffset?: number; maxPx?: number; minPx?: number },
): number | null {
  const header = Math.max(0, opts.headerOffset ?? 0);
  const reach = Math.min(opts.maxPx ?? SETTLE_MAX_PX, Math.max(0, opts.viewportHeight) * 0.15);
  const floor = opts.minPx ?? SETTLE_MIN_PX;
  let best: number | null = null;
  for (const edge of edges) {
    if (!Number.isFinite(edge)) continue;
    const delta = edge - header;
    const size = Math.abs(delta);
    if (size < floor || size > reach) continue;
    if (best === null || size < Math.abs(best)) best = delta;
  }
  return best === null ? null : Math.round(best);
}

const EDGE_SELECTOR = ".rv-site-root section[id], .rv-site-root .rv-chapter";

function headerOffset(doc: Document): number {
  const header = doc.querySelector<HTMLElement>(".rv-site-root header");
  if (!header) return 0;
  const view = doc.defaultView;
  const position = view ? view.getComputedStyle(header).position : "";
  if (position !== "sticky" && position !== "fixed") return 0;
  const rect = header.getBoundingClientRect();
  return rect.top <= 1 && rect.bottom > 0 ? rect.bottom : 0;
}

function typingOrSelecting(doc: Document): boolean {
  const active = doc.activeElement as HTMLElement | null;
  if (active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))) return true;
  const selection = doc.getSelection?.();
  return Boolean(selection && !selection.isCollapsed);
}

/** Installs the settle on a desktop browser; returns the cleanup. A no-op on touch or reduced motion. */
export function installSectionSettle(win: Window): () => void {
  const fine = win.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches ?? false;
  const reduce = win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? true;
  if (!fine || reduce) return () => {};
  const doc = win.document;
  let lastWheel = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let settlingUntil = 0;

  const settle = () => {
    timer = null;
    const now = Date.now();
    if (now - lastWheel > SETTLE_WHEEL_WINDOW_MS || now < settlingUntil) return;
    if (typingOrSelecting(doc)) return;
    const root = doc.scrollingElement ?? doc.documentElement;
    if (win.scrollY <= 0 || win.scrollY + win.innerHeight >= root.scrollHeight - 2) return;
    const edges = Array.from(doc.querySelectorAll<HTMLElement>(EDGE_SELECTOR), (el) => el.getBoundingClientRect().top);
    const delta = settleDelta(edges, { viewportHeight: win.innerHeight, headerOffset: headerOffset(doc) });
    if (delta === null) return;
    settlingUntil = now + 700;
    win.scrollBy({ top: delta, behavior: "smooth" });
  };
  const onWheel = () => {
    lastWheel = Date.now();
    settlingUntil = 0; // the visitor took over; never fight them
  };
  const onScroll = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(settle, SETTLE_IDLE_MS);
  };
  const onOtherInput = () => {
    lastWheel = 0;
  };
  win.addEventListener("wheel", onWheel, { passive: true });
  win.addEventListener("scroll", onScroll, { passive: true });
  win.addEventListener("keydown", onOtherInput, { passive: true });
  win.addEventListener("pointerdown", onOtherInput, { passive: true });
  return () => {
    if (timer) clearTimeout(timer);
    win.removeEventListener("wheel", onWheel);
    win.removeEventListener("scroll", onScroll);
    win.removeEventListener("keydown", onOtherInput);
    win.removeEventListener("pointerdown", onOtherInput);
  };
}
