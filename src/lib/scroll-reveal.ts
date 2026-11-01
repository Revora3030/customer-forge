/**
 * Scroll-reveal parity for browsers without CSS scroll-driven animations.
 *
 * Browsers with `animation-timeline: view()` already reveal `.rv-cn-auto`
 * elements with a pure-CSS, transform-only rise (see MOTION_CSS in
 * CompositionRenderer). Others (older Safari, Firefox) get the same small rise
 * from this IntersectionObserver fallback.
 *
 * Safety rules, all deliberate:
 *  - Content is never hidden: only a small `transform` is applied, never
 *    opacity or visibility, so a missed observer callback leaves everything
 *    readable and in place.
 *  - Nothing runs without JavaScript, so server-rendered markup (and crawlers)
 *    see the final, untransformed page.
 *  - Nothing runs under prefers-reduced-motion: reduce, and the matching CSS is
 *    wrapped in the same media query.
 *  - Only elements still below the fold at scan time are prepared; anything
 *    already on screen is left alone, so there is no flash on first paint.
 */

export const REVEAL_SELECTOR = ".rv-cn-auto";
export const WAIT_ATTR = "data-rv-wait";
export const GO_ATTR = "data-rv-go";
export const SEEN_ATTR = "data-rv-seen";
/** How long the transition attribute stays so hover transforms are not slowed afterwards. */
export const SETTLE_MS = 1400;

type ObserverEntry = { isIntersecting: boolean; target: Element };
type ObserverLike = { observe(el: Element): void; unobserve(el: Element): void; disconnect(): void };

export type RevealEnv = {
  document: { querySelectorAll(selector: string): ArrayLike<Element> };
  innerHeight: number;
  matchMedia?: (query: string) => { matches: boolean };
  supports?: (property: string, value: string) => boolean;
  createObserver?: (callback: (entries: ObserverEntry[]) => void, options: { rootMargin: string; threshold: number }) => ObserverLike;
  setTimeout: (callback: () => void, ms: number) => unknown;
};

/** True when the fallback should run at all in this environment. */
export function revealFallbackWanted(env: RevealEnv): boolean {
  if (!env.createObserver) return false;
  // Browsers with view() timelines animate in CSS; do not double up.
  if (env.supports?.("animation-timeline", "view()")) return false;
  const reduced = env.matchMedia?.("(prefers-reduced-motion: reduce)");
  // If motion preference cannot be read, stay still rather than animate.
  if (!reduced || reduced.matches) return false;
  return true;
}

/**
 * Prepares every not-yet-seen reveal target that is below the fold and reveals
 * it when it nears the viewport. Safe to call repeatedly (idempotent per
 * element). Returns how many elements were prepared.
 */
export function scanForReveal(env: RevealEnv, observer: ObserverLike): number {
  let prepared = 0;
  const targets = env.document.querySelectorAll(REVEAL_SELECTOR);
  for (let i = 0; i < targets.length; i++) {
    const el = targets[i];
    if (!el || el.hasAttribute(WAIT_ATTR) || el.hasAttribute(GO_ATTR) || el.hasAttribute(SEEN_ATTR)) continue;
    const rect = el.getBoundingClientRect();
    // Already on screen (or above): leave it exactly as rendered.
    if (rect.top < env.innerHeight) continue;
    el.setAttribute(WAIT_ATTR, "");
    observer.observe(el);
    prepared++;
  }
  return prepared;
}

let active: { observer: ObserverLike } | null = null;

/** Starts (once) the shared observer and scans the page. Returns whether it is running. */
export function startScrollReveal(env: RevealEnv): boolean {
  if (!revealFallbackWanted(env) || !env.createObserver) return false;
  if (!active) {
    const observer = env.createObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target;
          observer.unobserve(el);
          el.setAttribute(GO_ATTR, "");
          el.removeAttribute(WAIT_ATTR);
          env.setTimeout(() => { // DevSkim: ignore DS172411 -- Fixed callback and constant delay; no untrusted data.
            el.removeAttribute(GO_ATTR);
            el.setAttribute(SEEN_ATTR, "");
          }, SETTLE_MS);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.01 },
    );
    active = { observer };
  }
  scanForReveal(env, active.observer);
  return true;
}

/** Test helper: drop the shared observer. */
export function resetScrollReveal(): void {
  active?.observer.disconnect();
  active = null;
}

/** The real browser environment, or null on the server. */
export function browserRevealEnv(): RevealEnv | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const win = window;
  return {
    document,
    innerHeight: win.innerHeight,
    matchMedia: (query) => win.matchMedia(query),
    supports: (property, value) => (typeof CSS !== "undefined" && typeof CSS.supports === "function" ? CSS.supports(property, value) : false),
    ...(typeof win.IntersectionObserver === "function"
      ? { createObserver: (callback, options) => new win.IntersectionObserver((entries) => callback(entries), options) as ObserverLike }
      : {}),
    setTimeout: (callback, ms) => win.setTimeout(callback, ms), // DevSkim: ignore DS172411 -- Fixed callback and constant delay; no untrusted data.
  };
}
