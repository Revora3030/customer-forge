/**
 * One Google tag for Revora's own marketing site.
 *
 * gtag.js is injected exactly once (GA4 and the Google Ads tag share it; each
 * only adds a `config` call), and only after the page's `load` event or the
 * visitor's first pointer, scroll, key or touch input, whichever comes first.
 * After `load` it waits for an idle slot (with a timeout fallback) so the tag
 * stays off the main thread during the Lighthouse/TBT window.
 * Nothing from Google is requested before then, so it never competes with the
 * first paint. Consent Mode defaults are set inline in the document head
 * before this runs and are not touched here.
 */

const SCRIPT_MARK = "data-google-tag";
const INTERACTION_EVENTS = ["pointerdown", "scroll", "keydown", "touchstart"] as const;

let scriptRequested = false;
let jsStamped = false;

/** Defines `gtag` and stamps `js` once, however many Google products share it. */
export function initGtag(): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer ?? [];
  if (!window.gtag) {
    window.gtag = function gtag(...args: [string, ...unknown[]]) {
      window.dataLayer?.push(args);
    };
  }
  if (!jsStamped) {
    jsStamped = true;
    window.gtag("js", new Date());
  }
}

/** Longest wait after `load` for an idle slot before gtag.js is injected anyway. */
export const IDLE_FALLBACK_MS = 4000;

type IdleWindow = {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
};

/**
 * Runs `run` once, at the visitor's first interaction or, after the page's
 * `load` event, at the first idle slot (requestIdleCallback with a timeout, or
 * a plain timer where idle callbacks are unsupported). The timeout guarantees
 * the tag still loads, and queued `dataLayer` conversions still send, for
 * visitors who never interact.
 */
export function whenPageReady(run: () => void): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const win = window as Partial<Window>;
  // Environments without events or readyState (tests, odd embeds) run at once.
  if (typeof win.addEventListener !== "function" || typeof document.readyState !== "string") {
    run();
    return;
  }
  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    window.removeEventListener("load", afterLoad);
    for (const name of INTERACTION_EVENTS) window.removeEventListener(name, fire);
    run();
  };
  function afterLoad() {
    if (done) return;
    const ric = (window as unknown as IdleWindow).requestIdleCallback;
    if (typeof ric === "function") ric.call(window, fire, { timeout: IDLE_FALLBACK_MS });
    else globalThis.setTimeout(fire, Math.min(IDLE_FALLBACK_MS, 2500));
  }
  for (const name of INTERACTION_EVENTS) window.addEventListener(name, fire, { once: true, passive: true });
  if (document.readyState === "complete") afterLoad();
  else window.addEventListener("load", afterLoad, { once: true });
}

/**
 * Injects the single gtag.js script (after load or first interaction). Later
 * calls, from either GA4 or Google Ads, do nothing: the first measurement ID
 * names the script and every other ID is a `config` call on the same library.
 */
export function ensureGoogleTagScript(primaryId: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (scriptRequested) return;
  scriptRequested = true;
  whenPageReady(() => {
    if (typeof document.querySelector === "function" && document.querySelector(`script[${SCRIPT_MARK}]`)) return;
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(primaryId)}`;
    script.setAttribute?.(SCRIPT_MARK, "");
    // Blocked analytics (ad blockers, strict networks) must fail silently.
    script.onerror = () => {
      script.remove();
    };
    document.head.appendChild(script);
  });
}

/** Test hook: forget that the script was requested. */
export function resetGoogleTagForTests(): void {
  scriptRequested = false;
  jsStamped = false;
}
