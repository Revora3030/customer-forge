// @vitest-environment jsdom
/**
 * Audit P1-09: a looping backdrop video needs a visible still, a keyboard
 * pause control (WCAG 2.2.2) and a reduced-motion setting that is followed live.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SceneVideo } from "@/components/site/CinematicBlocks";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Listener = (event: { matches: boolean }) => void;
let reduced = false;
let listeners: Listener[] = [];
let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;

beforeEach(() => {
  reduced = false;
  listeners = [];
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query.includes("prefers-reduced-motion") ? reduced : false;
    },
    media: query,
    addEventListener: (_: string, fn: Listener) => listeners.push(fn),
    removeEventListener: (_: string, fn: Listener) => {
      listeners = listeners.filter((l) => l !== fn);
    },
  })) as never;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  HTMLMediaElement.prototype.play = play as never;
  HTMLMediaElement.prototype.pause = pause as never;
});

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(props: { poster?: string | null } = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<SceneVideo src="https://cdn.example/clip.mp4" alt="Bay" eager={false} {...props} />));
  return host;
}

describe("SceneVideo (audit P1-09)", () => {
  it("server HTML has the still (poster and first frame), no autoplay and no control that cannot work yet", () => {
    const html = renderToStaticMarkup(<SceneVideo src="https://cdn.example/clip.mp4" alt="Bay" eager={false} poster="https://cdn.example/still.jpg" />);
    expect(html).toContain('poster="https://cdn.example/still.jpg"');
    expect(html).toContain('src="https://cdn.example/clip.mp4#t=0.001"');
    expect(html).not.toContain("autoplay");
    expect(html).not.toContain("data-hero-control");
  });

  it("shows a pause button after hydration that pauses and resumes by keyboard-operable click", () => {
    const el = mount();
    const button = el.querySelector<HTMLButtonElement>("button[data-hero-control]")!;
    expect(button.tagName).toBe("BUTTON");
    const video = el.querySelector("video")!;
    expect(play).toHaveBeenCalled();
    // A browser reports that frames are playing; jsdom does not, so say it ourselves.
    act(() => { video.dispatchEvent(new Event("playing")); });
    expect(button.getAttribute("aria-label")).not.toBe("Play background video");
    act(() => button.click());
    expect(pause).toHaveBeenCalled();
    expect(button.getAttribute("aria-label")).toBe("Play background video");
    act(() => button.click());
    act(() => { video.dispatchEvent(new Event("playing")); });
    expect(button.getAttribute("aria-label")).not.toBe("Play background video");
  });

  it("follows a later reduced-motion change without a reload", () => {
    const el = mount();
    expect(listeners.length).toBeGreaterThan(0);
    pause.mockClear();
    reduced = true;
    act(() => listeners.forEach((fn) => fn({ matches: true })));
    expect(pause).toHaveBeenCalled();
    expect(el.querySelector("button[data-hero-control]")!.getAttribute("aria-label")).toBe("Play background video");
    play.mockClear();
    reduced = false;
    act(() => listeners.forEach((fn) => fn({ matches: false })));
    expect(play).toHaveBeenCalled();
  });

  it("stays paused on mount for a reduced-motion visitor and removes its listener on unmount", () => {
    reduced = true;
    mount();
    expect(play).not.toHaveBeenCalled();
    expect(pause).toHaveBeenCalled();
    act(() => root!.unmount());
    root = null;
    expect(listeners).toHaveLength(0);
  });
});
