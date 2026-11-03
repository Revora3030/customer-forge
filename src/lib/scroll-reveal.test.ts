import { afterEach, describe, expect, it } from "vitest";
import { GO_ATTR, SEEN_ATTR, SETTLE_MS, WAIT_ATTR, resetScrollReveal, revealFallbackWanted, startScrollReveal, type RevealEnv } from "./scroll-reveal";

type Callback = (entries: Array<{ isIntersecting: boolean; target: Element }>) => void;

function fakeElement(top: number) {
  const attrs = new Set<string>();
  return {
    attrs,
    hasAttribute: (name: string) => attrs.has(name),
    setAttribute: (name: string) => void attrs.add(name),
    removeAttribute: (name: string) => void attrs.delete(name),
    getBoundingClientRect: () => ({ top }),
  };
}

function makeEnv(opts: { elements: ReturnType<typeof fakeElement>[]; reduced?: boolean; viewTimeline?: boolean; noObserver?: boolean; noMatchMedia?: boolean }) {
  const observed: unknown[] = [];
  const timers: Array<() => void> = [];
  let callback: Callback = () => {};
  const env: RevealEnv = {
    document: { querySelectorAll: () => opts.elements as unknown as Element[] },
    innerHeight: 800,
    ...(opts.noMatchMedia ? {} : { matchMedia: () => ({ matches: opts.reduced === true }) }),
    supports: () => opts.viewTimeline === true,
    ...(opts.noObserver
      ? {}
      : {
          createObserver: (cb: Callback) => {
            callback = cb;
            return { observe: (el: Element) => void observed.push(el), unobserve: () => {}, disconnect: () => {} };
          },
        }),
    setTimeout: (cb) => void timers.push(cb),
  };
  return { env, observed, timers, fire: (el: unknown) => callback([{ isIntersecting: true, target: el as Element }]) };
}

afterEach(() => resetScrollReveal());

describe("scroll reveal fallback", () => {
  it("does nothing under prefers-reduced-motion", () => {
    const el = fakeElement(2000);
    const { env, observed } = makeEnv({ elements: [el], reduced: true });
    expect(revealFallbackWanted(env)).toBe(false);
    expect(startScrollReveal(env)).toBe(false);
    expect(observed).toHaveLength(0);
    expect(el.attrs.size).toBe(0);
  });

  it("does nothing when the motion preference cannot be read", () => {
    const { env } = makeEnv({ elements: [fakeElement(2000)], noMatchMedia: true });
    expect(revealFallbackWanted(env)).toBe(false);
  });

  it("does nothing where CSS view() timelines already animate, or without IntersectionObserver", () => {
    expect(revealFallbackWanted(makeEnv({ elements: [], viewTimeline: true }).env)).toBe(false);
    expect(revealFallbackWanted(makeEnv({ elements: [], noObserver: true }).env)).toBe(false);
  });

  it("leaves on-screen elements untouched and prepares only those below the fold", () => {
    const visible = fakeElement(100);
    const below = fakeElement(1500);
    const { env, observed } = makeEnv({ elements: [visible, below] });
    expect(startScrollReveal(env)).toBe(true);
    expect(visible.attrs.size).toBe(0);
    expect(below.attrs.has(WAIT_ATTR)).toBe(true);
    expect(observed).toEqual([below]);
  });

  it("is idempotent when scanned again", () => {
    const below = fakeElement(1500);
    const { env, observed } = makeEnv({ elements: [below] });
    startScrollReveal(env);
    startScrollReveal(env);
    expect(observed).toHaveLength(1);
  });

  it("reveals on intersect, then settles so hover transforms are not slowed", () => {
    const below = fakeElement(1500);
    const { env, fire, timers } = makeEnv({ elements: [below] });
    startScrollReveal(env);
    fire(below);
    expect(below.attrs.has(WAIT_ATTR)).toBe(false);
    expect(below.attrs.has(GO_ATTR)).toBe(true);
    expect(timers).toHaveLength(1);
    expect(SETTLE_MS).toBeGreaterThan(0);
    timers[0]!();
    expect(below.attrs.has(GO_ATTR)).toBe(false);
    expect(below.attrs.has(SEEN_ATTR)).toBe(true);
    // A settled element is not prepared again by a later scan.
    startScrollReveal(env);
    expect(below.attrs.has(WAIT_ATTR)).toBe(false);
  });
});
