import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ARM_TIMEOUT_MS, READY_CLASS, startMarketingReveal, type MarketingRevealEnv } from "./marketing-reveal";

function section(top: number) {
  return { dataset: {} as Record<string, string>, getBoundingClientRect: () => ({ top }) } as unknown as HTMLElement;
}

function setup(over: Partial<MarketingRevealEnv> = {}) {
  const classes = new Set<string>();
  const timers: Array<{ cb: () => void; ms: number; cleared: boolean }> = [];
  let fire: ((entries: Array<{ isIntersecting: boolean; target: HTMLElement }>) => void) | null = null;
  const observed: HTMLElement[] = [];
  const sections = [section(100), section(3000), section(6000)];
  const env: MarketingRevealEnv = {
    root: { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) } },
    sections,
    innerHeight: 1080,
    reducedMotion: false,
    createObserver: (cb) => {
      fire = cb;
      return { observe: (el) => observed.push(el), unobserve: () => {}, disconnect: () => {} };
    },
    setTimeout: (cb, ms) => timers.push({ cb, ms, cleared: false }) - 1,
    clearTimeout: (h) => {
      const t = timers[h as number];
      if (t) t.cleared = true;
    },
    ...over,
  };
  const stop = startMarketingReveal(env);
  return { env, classes, timers, sections, observed, stop, fire: (e: Parameters<NonNullable<typeof fire>>[0]) => fire?.(e) };
}

const hidden = (s: HTMLElement) => s.dataset["reveal"] === "" && s.dataset["revealed"] === undefined;

describe("marketing data-reveal hardening", () => {
  it("does not hide anything until the observer has delivered its first callback", () => {
    const t = setup();
    expect(t.classes.has(READY_CLASS)).toBe(false);
    t.fire([{ isIntersecting: false, target: t.sections[1]! }]);
    expect(t.classes.has(READY_CLASS)).toBe(true);
    expect(t.timers[0]!.cleared).toBe(true);
    expect(hidden(t.sections[1]!)).toBe(true);
    t.fire([{ isIntersecting: true, target: t.sections[1]! }]);
    expect(hidden(t.sections[1]!)).toBe(false);
  });

  it("shows on-screen sections at once and only observes below-the-fold ones", () => {
    const t = setup();
    expect(t.sections[0]!.dataset["revealed"]).toBe("");
    expect(t.observed).toEqual([t.sections[1], t.sections[2]]);
  });

  it("reveals everything if the observer never fires", () => {
    const t = setup();
    expect(t.timers[0]!.ms).toBe(ARM_TIMEOUT_MS);
    t.timers[0]!.cb();
    expect(t.classes.has(READY_CLASS)).toBe(false);
    expect(t.sections.every((s) => s.dataset["revealed"] === "")).toBe(true);
  });

  it("reveals everything before printing", () => {
    const hook: { print?: () => void } = {};
    const t = setup({ onBeforePrint: (cb) => ((hook.print = cb), () => {}) });
    t.fire([{ isIntersecting: false, target: t.sections[2]! }]);
    hook.print?.();
    expect(hook.print).toBeTypeOf("function");
    expect(t.sections.some(hidden)).toBe(false);
  });

  it("does nothing under reduced motion or without IntersectionObserver", () => {
    for (const over of [{ reducedMotion: true }, { createObserver: undefined }] as unknown as Partial<MarketingRevealEnv>[]) {
      const t = setup(over);
      expect(t.classes.size).toBe(0);
      expect(t.sections.some((s) => s.dataset["reveal"] !== undefined)).toBe(false);
    }
  });

  it("cleanup removes the ready class and markers", () => {
    const t = setup();
    t.fire([]);
    t.stop();
    expect(t.classes.has(READY_CLASS)).toBe(false);
    expect(t.sections.some((s) => s.dataset["reveal"] !== undefined)).toBe(false);
  });

  it("CSS gates the hidden state behind reveal-ready and reduced-motion", () => {
    const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    const at = css.indexOf("html.reveal-ready [data-reveal]:not([data-revealed])");
    expect(at).toBeGreaterThan(-1);
    const media = css.lastIndexOf("@media (prefers-reduced-motion: no-preference) {", at);
    expect(media).toBeGreaterThan(-1);
    expect(at - media).toBeLessThan(80);
    expect(css).toMatch(/@media print\s*{\s*html\.reveal-ready \[data-reveal\] { opacity: 1 !important/);
  });
});
