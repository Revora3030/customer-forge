import { afterEach, describe, expect, it, vi } from "vitest";
import { installSectionSettle, SETTLE_IDLE_MS, settleDelta } from "./section-settle";

describe("settleDelta", () => {
  it("lines up a section edge that is close to the top", () => {
    expect(settleDelta([-900, 60, 900], { viewportHeight: 1000 })).toBe(60);
    expect(settleDelta([-40, 700], { viewportHeight: 1000 })).toBe(-40);
  });
  it("accounts for a sticky header", () => {
    expect(settleDelta([110], { viewportHeight: 1000, headerOffset: 72 })).toBe(38);
  });
  it("never moves further than the cap or 15% of the screen, and ignores tiny gaps", () => {
    expect(settleDelta([300], { viewportHeight: 1000 })).toBeNull();
    expect(settleDelta([120], { viewportHeight: 700 })).toBeNull(); // 15% of 700 = 105
    expect(settleDelta([3], { viewportHeight: 1000 })).toBeNull();
    expect(settleDelta([], { viewportHeight: 1000 })).toBeNull();
  });
});

type Listener = () => void;
function fakeWindow(opts: { fine: boolean; reduce?: boolean; edges: number[] }) {
  const listeners: Record<string, Listener[]> = {};
  const scrollBy = vi.fn();
  const doc = {
    activeElement: null,
    getSelection: () => ({ isCollapsed: true }),
    querySelector: () => null,
    querySelectorAll: () => opts.edges.map((top) => ({ getBoundingClientRect: () => ({ top }) })),
    scrollingElement: { scrollHeight: 5000 },
    documentElement: { scrollHeight: 5000 },
  };
  const win = {
    document: doc,
    scrollY: 1200,
    innerHeight: 900,
    matchMedia: (q: string) => ({ matches: q.includes("reduce") ? Boolean(opts.reduce) : opts.fine }),
    addEventListener: (type: string, fn: Listener) => (listeners[type] ??= []).push(fn),
    removeEventListener: (type: string, fn: Listener) => (listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn)),
    scrollBy,
  };
  const fire = (type: string) => (listeners[type] ?? []).forEach((fn) => fn());
  return { win: win as unknown as Window, fire, scrollBy, listeners };
}

describe("installSectionSettle", () => {
  afterEach(() => vi.useRealTimers());

  it("settles after a wheel scroll comes to rest", () => {
    vi.useFakeTimers();
    const { win, fire, scrollBy } = fakeWindow({ fine: true, edges: [50] });
    const stop = installSectionSettle(win);
    fire("wheel");
    fire("scroll");
    vi.advanceTimersByTime(SETTLE_IDLE_MS - 10);
    fire("scroll"); // still scrolling: nothing yet
    vi.advanceTimersByTime(SETTLE_IDLE_MS - 10);
    expect(scrollBy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(scrollBy).toHaveBeenCalledWith({ top: 50, behavior: "smooth" });
    stop();
  });

  it("does nothing after a keyboard or scrollbar scroll", () => {
    vi.useFakeTimers();
    const { win, fire, scrollBy } = fakeWindow({ fine: true, edges: [50] });
    installSectionSettle(win);
    fire("wheel");
    fire("keydown");
    fire("scroll");
    vi.advanceTimersByTime(1000);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("is off on touch screens and for reduced motion", () => {
    expect(Object.keys(fakeWindow({ fine: false, edges: [] }).listeners)).toHaveLength(0);
    const touch = fakeWindow({ fine: false, edges: [50] });
    installSectionSettle(touch.win);
    expect(Object.keys(touch.listeners)).toHaveLength(0);
    const reduced = fakeWindow({ fine: true, reduce: true, edges: [50] });
    installSectionSettle(reduced.win);
    expect(Object.keys(reduced.listeners)).toHaveLength(0);
  });

  it("removes every listener on cleanup", () => {
    const { win, listeners } = fakeWindow({ fine: true, edges: [] });
    const stop = installSectionSettle(win);
    stop();
    expect(Object.values(listeners).every((list) => list.length === 0)).toBe(true);
  });
});
