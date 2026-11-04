/**
 * Marketing-page section reveal (the `[data-reveal]` rise-in on the public
 * Revora pages). Content is visible by default: sections are only hidden once
 * `html.reveal-ready` is set, and that class is only added after the
 * IntersectionObserver has proved it is working by delivering its first
 * callback. If the observer never reports, a fail-safe reveals everything.
 * Reduced-motion visitors and printing always get the full page.
 */

export const READY_CLASS = "reveal-ready";
/** How long to wait for the observer's first callback before giving up. */
export const ARM_TIMEOUT_MS = 1500;

type Entry = { isIntersecting: boolean; target: HTMLElement };
type ObserverLike = { observe(el: HTMLElement): void; unobserve(el: HTMLElement): void; disconnect(): void };

export type MarketingRevealEnv = {
  root: { classList: { add(c: string): void; remove(c: string): void } };
  sections: HTMLElement[];
  innerHeight: number;
  reducedMotion: boolean;
  createObserver?: (cb: (entries: Entry[]) => void) => ObserverLike;
  setTimeout: (cb: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  onBeforePrint?: (cb: () => void) => () => void;
};

/** Starts the reveal; returns a cleanup function. Never leaves content hidden. */
export function startMarketingReveal(env: MarketingRevealEnv): () => void {
  const { sections, root } = env;
  if (!sections.length || env.reducedMotion || !env.createObserver) return () => {};

  const revealAll = () => {
    for (const s of sections) s.dataset["revealed"] = "";
  };
  let armed = false;
  const observer = env.createObserver((entries) => {
    if (!armed) {
      armed = true;
      env.clearTimeout(failSafe);
      root.classList.add(READY_CLASS);
    }
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.dataset["revealed"] = "";
      observer.unobserve(entry.target);
    }
  });
  const failSafe = env.setTimeout(() => { // DevSkim: ignore DS172411 -- Fixed callback and constant delay; no untrusted data.
    if (armed) return;
    revealAll();
    observer.disconnect();
  }, ARM_TIMEOUT_MS);

  for (const section of sections) {
    section.dataset["reveal"] = "";
    if (section.getBoundingClientRect().top < env.innerHeight) section.dataset["revealed"] = "";
    else observer.observe(section);
  }
  const offPrint = env.onBeforePrint?.(revealAll);

  return () => {
    env.clearTimeout(failSafe);
    observer.disconnect();
    offPrint?.();
    root.classList.remove(READY_CLASS);
    for (const s of sections) {
      delete s.dataset["reveal"];
      delete s.dataset["revealed"];
    }
  };
}
