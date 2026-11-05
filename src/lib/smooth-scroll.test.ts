import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeSmoothScroller,
  keepsNativeWheel,
  SMOOTH_SCROLL_CSS,
  SMOOTH_SCROLL_MIN_WIDTH,
  SMOOTH_SCROLL_OPTIONS,
  smoothScrollAllowed,
  smoothScrollBy,
  startSmoothScroll,
  type SmoothScroller,
} from "./smooth-scroll";

type Env = { fine?: boolean; coarseOnly?: boolean; reduce?: boolean; width?: number; framed?: boolean };
function fakeWindow(env: Env = {}) {
  const state = { fine: true, coarseOnly: false, reduce: false, width: 1440, framed: false, ...env };
  const changeListeners: Array<() => void> = [];
  const win: Record<string, unknown> = {
    get innerWidth() {
      return state.width;
    },
    matchMedia: (q: string) => ({
      matches: q.includes("reduce")
        ? state.reduce
        : q.includes("any-pointer: coarse")
          ? state.coarseOnly
          : q.includes("any-pointer: fine")
            ? !state.coarseOnly
            : state.fine,
      addEventListener: (_: string, fn: () => void) => changeListeners.push(fn),
      removeEventListener: (_: string, fn: () => void) => {
        const i = changeListeners.indexOf(fn);
        if (i >= 0) changeListeners.splice(i, 1);
      },
    }),
    scrollBy: vi.fn(),
  };
  win["self"] = win;
  win["top"] = state.framed ? {} : win;
  const change = () => [...changeListeners].forEach((fn) => fn());
  return { win: win as unknown as Window, state, change, changeListeners };
}

function fakeLenis() {
  const scrollTo = vi.fn<SmoothScroller["scrollTo"]>();
  const instance: SmoothScroller & { destroyed: boolean; scrollTo: typeof scrollTo } = {
    scroll: 500,
    destroyed: false,
    scrollTo,
    destroy() {
      this.destroyed = true;
    },
  };
  const create = vi.fn(() => instance);
  const load = vi.fn(async () => create);
  return { instance, create, load };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("smoothScrollAllowed", () => {
  it("allows a wide desktop window with a fine pointer", () => {
    expect(smoothScrollAllowed(fakeWindow().win)).toBe(true);
  });
  it("never runs on touch or coarse-only pointers", () => {
    expect(smoothScrollAllowed(fakeWindow({ fine: false }).win)).toBe(false);
    expect(smoothScrollAllowed(fakeWindow({ coarseOnly: true }).win)).toBe(false);
  });
  it("never runs under prefers-reduced-motion", () => {
    expect(smoothScrollAllowed(fakeWindow({ reduce: true }).win)).toBe(false);
  });
  it("never runs below the desktop width or inside a frame", () => {
    expect(smoothScrollAllowed(fakeWindow({ width: SMOOTH_SCROLL_MIN_WIDTH - 1 }).win)).toBe(false);
    expect(smoothScrollAllowed(fakeWindow({ width: 320 }).win)).toBe(false);
    expect(smoothScrollAllowed(fakeWindow({ width: 2560 }).win)).toBe(true);
    expect(smoothScrollAllowed(fakeWindow({ framed: true }).win)).toBe(false);
  });
  it("treats a missing matchMedia as not allowed", () => {
    const { win } = fakeWindow();
    (win as unknown as Record<string, unknown>)["matchMedia"] = undefined;
    expect(smoothScrollAllowed(win)).toBe(false);
  });
});

describe("startSmoothScroll", () => {
  afterEach(() => {
    expect(activeSmoothScroller()).toBeNull();
  });

  it("never loads the package where it is not allowed", async () => {
    for (const env of [{ fine: false }, { reduce: true }, { width: 800 }, { framed: true }] as Env[]) {
      const { load } = fakeLenis();
      const stop = startSmoothScroll(fakeWindow(env).win, load);
      await flush();
      expect(load).not.toHaveBeenCalled();
      stop();
    }
  });

  it("starts one instance per page and stops it with the last owner", async () => {
    const { win } = fakeWindow();
    const { instance, create, load } = fakeLenis();
    const a = startSmoothScroll(win, load);
    const b = startSmoothScroll(win, load);
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(SMOOTH_SCROLL_OPTIONS);
    expect(activeSmoothScroller()).toBe(instance);
    a();
    a(); // idempotent
    expect(instance.destroyed).toBe(false);
    b();
    expect(instance.destroyed).toBe(true);
  });

  it("does not start when stopped before the package arrives", async () => {
    const { win } = fakeWindow();
    const { create, load } = fakeLenis();
    const stop = startSmoothScroll(win, load);
    stop();
    await flush();
    expect(create).not.toHaveBeenCalled();
  });

  it("hands scroll back when reduced motion turns on mid-visit", async () => {
    const { win, state, change, changeListeners } = fakeWindow();
    const { instance, load } = fakeLenis();
    const stop = startSmoothScroll(win, load);
    await flush();
    expect(activeSmoothScroller()).toBe(instance);
    state.reduce = true;
    change();
    expect(instance.destroyed).toBe(true);
    expect(activeSmoothScroller()).toBeNull();
    stop();
    expect(changeListeners).toHaveLength(0);
  });

  it("keeps native scroll when the package fails to load", async () => {
    const { win } = fakeWindow();
    const stop = startSmoothScroll(win, () => Promise.reject(new Error("offline")));
    await flush();
    expect(activeSmoothScroller()).toBeNull();
    stop();
  });
});

describe("smoothScrollBy", () => {
  it("uses native smooth scroll when Lenis is not running", () => {
    const { win } = fakeWindow();
    smoothScrollBy(win, 40);
    expect(win.scrollBy).toHaveBeenCalledWith({ top: 40, behavior: "smooth" });
  });
  it("goes through Lenis while it runs, so the two never fight", async () => {
    const { win } = fakeWindow();
    const { instance, load } = fakeLenis();
    const stop = startSmoothScroll(win, load);
    await flush();
    smoothScrollBy(win, -30);
    expect(instance.scrollTo).toHaveBeenCalledWith(470, { duration: 0.6 });
    expect(win.scrollBy).not.toHaveBeenCalled();
    stop();
  });
});

describe("options and CSS", () => {
  it("smooths the wheel only, never touch, and keeps anchors and nested scrollers working", () => {
    expect(SMOOTH_SCROLL_OPTIONS).toMatchObject({ smoothWheel: true, syncTouch: false, anchors: true, allowNestedScroll: true, autoRaf: true });
  });
  it("leaves horizontal collection rails and data-lenis-prevent on native wheel", () => {
    const el = (classes: string[], attrs: string[] = []) =>
      ({ classList: { contains: (c: string) => classes.includes(c) }, hasAttribute: (a: string) => attrs.includes(a) }) as unknown as HTMLElement;
    expect(keepsNativeWheel(el(["rv-collection-viewport"]))).toBe(true);
    expect(keepsNativeWheel(el([], ["data-lenis-prevent"]))).toBe(true);
    expect(keepsNativeWheel(el(["rv-chapter"]))).toBe(false);
  });
  it("is scoped to html.lenis, turns off native smooth scroll and never blocks iframes", () => {
    expect(SMOOTH_SCROLL_CSS).toContain("html.lenis{scroll-behavior:auto!important}");
    expect(SMOOTH_SCROLL_CSS).not.toMatch(/iframe/);
    expect(SMOOTH_SCROLL_CSS).not.toMatch(/(^|})\s*(html|body)\s*\{/);
  });
});
