/**
 * Desktop-only smooth wheel scrolling for published customer sites, using
 * Lenis (MIT, https://github.com/darkroomengineering/lenis).
 *
 * Lenis only runs where it helps and can never get in a visitor's way:
 * - desktop only: a hovering, fine pointer (mouse or trackpad) and a window at
 *   least SMOOTH_SCROLL_MIN_WIDTH wide; never on touch or coarse pointers,
 *   where the native momentum scroll and the touch-only chapter snap stay;
 * - never under `prefers-reduced-motion: reduce`, and it stops at once if the
 *   visitor turns that setting on while the page is open;
 * - never inside a frame (the builder preview), and never on the server: the
 *   package is only reached through a dynamic import from a client effect.
 *
 * Scroll position stays native (Lenis drives window.scrollTo), so scroll
 * events, IntersectionObserver scroll reveals, the progress bar and sticky
 * headers keep working unchanged. The desktop section settle routes its small
 * correction through `smoothScrollBy` so the two never fight.
 */

/** Narrowest window that gets smooth scrolling (small laptops and up). */
export const SMOOTH_SCROLL_MIN_WIDTH = 1024;
/** Extra time a smoothed wheel scroll keeps gliding after the last wheel event. */
export const SMOOTH_SCROLL_GLIDE_MS = 1500;

/** The slice of a Lenis instance this module relies on. */
export interface SmoothScroller {
  readonly scroll: number;
  scrollTo(target: number, options?: { duration?: number }): void;
  destroy(): void;
}

export interface SmoothScrollOptions {
  lerp: number;
  smoothWheel: boolean;
  syncTouch: boolean;
  autoRaf: boolean;
  anchors: boolean;
  allowNestedScroll: boolean;
  prevent: (node: HTMLElement) => boolean;
}

export type SmoothScrollerFactory = (options: SmoothScrollOptions) => SmoothScroller;

/**
 * Nested scrollers that keep their own native wheel: horizontal collection
 * rails (scroll-snap x), and anything an author marks with data-lenis-prevent.
 */
export function keepsNativeWheel(node: HTMLElement): boolean {
  const list = node.classList;
  if (list && typeof list.contains === "function" && list.contains("rv-collection-viewport")) return true;
  return typeof node.hasAttribute === "function" && node.hasAttribute("data-lenis-prevent");
}

export const SMOOTH_SCROLL_OPTIONS: SmoothScrollOptions = {
  lerp: 0.12,
  smoothWheel: true,
  syncTouch: false,
  autoRaf: true,
  anchors: true,
  allowNestedScroll: true,
  prevent: keepsNativeWheel,
};

/**
 * The minimal Lenis stylesheet, scoped to the `lenis` class Lenis adds to
 * <html>, so it changes nothing until Lenis runs. It turns off the app's
 * native `scroll-behavior: smooth` while Lenis drives the scroll (the two
 * together stutter). Unlike the stock lenis.css it never disables pointer
 * events on iframes, so embedded maps and booking widgets stay usable.
 */
export const SMOOTH_SCROLL_CSS =
  "html.lenis,html.lenis body{height:auto}" +
  "html.lenis{scroll-behavior:auto!important}" +
  ".lenis [data-lenis-prevent]{overscroll-behavior:contain}";

function matches(win: Window, query: string, fallback: boolean): boolean {
  try {
    return win.matchMedia?.(query)?.matches ?? fallback;
  } catch {
    return fallback;
  }
}

function framed(win: Window): boolean {
  try {
    return win.self !== win.top;
  } catch {
    return true; // a cross-origin parent: treat as framed
  }
}

/** Whether this window should get smooth scrolling right now. */
export function smoothScrollAllowed(win: Window): boolean {
  if (framed(win)) return false;
  if (!matches(win, "(hover: hover) and (pointer: fine)", false)) return false;
  if (matches(win, "(any-pointer: coarse)", false) && !matches(win, "(any-pointer: fine)", false)) return false;
  if (matches(win, "(prefers-reduced-motion: reduce)", true)) return false;
  return (win.innerWidth ?? 0) >= SMOOTH_SCROLL_MIN_WIDTH;
}

let active: SmoothScroller | null = null;
let owners = 0;
let generation = 0;

/** The running smooth scroller, or null when native scroll is in charge. */
export function activeSmoothScroller(): SmoothScroller | null {
  return active;
}

/**
 * Scrolls by `delta` pixels with a short glide: through Lenis when it runs
 * (so its own animation is not fought), otherwise with native smooth scroll.
 */
export function smoothScrollBy(win: Window, delta: number): void {
  if (active) {
    active.scrollTo(active.scroll + delta, { duration: 0.6 });
    return;
  }
  win.scrollBy({ top: delta, behavior: "smooth" });
}

/**
 * Starts smooth scrolling when the window allows it. One Lenis instance per
 * page however many callers ask; the last caller's cleanup stops it. The
 * loader is only called on an allowed desktop, so touch and reduced-motion
 * visitors never download the package. Never throws: a failed load leaves
 * native scroll in place.
 */
export function startSmoothScroll(win: Window, load: () => Promise<SmoothScrollerFactory>): () => void {
  if (!smoothScrollAllowed(win)) return () => {};
  owners += 1;
  let released = false;
  const mine = generation;
  if (!active && owners === 1) {
    load()
      .then((create) => {
        if (released || active || mine !== generation || owners === 0 || !smoothScrollAllowed(win)) return;
        active = create(SMOOTH_SCROLL_OPTIONS);
      })
      .catch(() => {
        /* native scroll stays */
      });
  }
  const stopAll = () => {
    generation += 1;
    const running = active;
    active = null;
    running?.destroy();
  };
  // Turning on reduced motion, or switching to touch, hands scroll back at once.
  const queries = ["(prefers-reduced-motion: reduce)", "(hover: hover) and (pointer: fine)"]
    .map((q) => {
      try {
        return win.matchMedia?.(q) ?? null;
      } catch {
        return null;
      }
    })
    .filter((q): q is MediaQueryList => Boolean(q && typeof q.addEventListener === "function"));
  const onChange = () => {
    if (!smoothScrollAllowed(win)) stopAll();
  };
  for (const q of queries) q.addEventListener("change", onChange);
  return () => {
    if (released) return;
    released = true;
    for (const q of queries) q.removeEventListener("change", onChange);
    owners = Math.max(0, owners - 1);
    if (owners === 0) stopAll();
  };
}
