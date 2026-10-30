/**
 * Keeps the builder chat usable while the on-screen keyboard is open on
 * phones (iOS Safari in particular).
 *
 * iOS doesn't shrink the layout viewport for the keyboard: it shrinks only the
 * *visual* viewport and scrolls the page under it. A chat sized from
 * 100vh/100dvh (or from a document offset) then jumps: the composer flies to
 * the top and the rest of the screen goes black. So while the keyboard is up
 * and focus is in the chat we pin the chat to exactly the visible area:
 *
 *   --builder-vv-top          visualViewport.offsetTop (px)
 *   --builder-vv-height       visualViewport.height (px)
 *   --builder-keyboard-inset  innerHeight − vv.height − vv.offsetTop (px)
 *   data-builder-keyboard="open" on the workspace root
 *
 * builder-workspace.css turns that into a fixed, visible-area-sized chat:
 * header at the top, transcript scrolling in the middle, composer sitting
 * right above the keyboard. Android (which resizes the layout viewport)
 * reports a ~0 inset and keeps the normal layout.
 */
import { useEffect, type RefObject } from "react";

/** Smaller insets are browser chrome (URL bar) settling, not a keyboard. */
export const KEYBOARD_MIN_INSET = 120;
export const KEYBOARD_MAX_WIDTH = 1023;

export type ViewportSample = {
  innerHeight: number;
  innerWidth: number;
  vvHeight: number;
  vvOffsetTop: number;
  /** Focus is in a text field inside the chat. */
  typingInChat: boolean;
};

export function keyboardState(sample: ViewportSample) {
  const inset = Math.max(0, Math.round(sample.innerHeight - sample.vvHeight - sample.vvOffsetTop));
  const open = sample.typingInChat && sample.innerWidth <= KEYBOARD_MAX_WIDTH && inset >= KEYBOARD_MIN_INSET;
  return {
    inset,
    open,
    top: Math.max(0, Math.round(sample.vvOffsetTop)),
    height: Math.max(0, Math.round(sample.vvHeight)),
  };
}

const isTextField = (el: Element | null) =>
  !!el && (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement || (el as HTMLElement).isContentEditable);

export function useKeyboardInset(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    const viewport = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!el || !viewport) return;
    const root = el.closest<HTMLElement>("[data-revora-builder-workspace]") ?? el;
    let frame = 0;
    const apply = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const active = document.activeElement;
        const state = keyboardState({
          innerHeight: window.innerHeight,
          innerWidth: window.innerWidth,
          vvHeight: viewport.height,
          vvOffsetTop: viewport.offsetTop,
          typingInChat: !!active && el.contains(active) && isTextField(active),
        });
        root.style.setProperty("--builder-keyboard-inset", `${state.inset}px`);
        root.style.setProperty("--builder-vv-top", `${state.top}px`);
        root.style.setProperty("--builder-vv-height", `${state.height}px`);
        if (state.open) root.setAttribute("data-builder-keyboard", "open");
        else root.removeAttribute("data-builder-keyboard");
      });
    };
    apply();
    viewport.addEventListener("resize", apply);
    viewport.addEventListener("scroll", apply);
    el.addEventListener("focusin", apply);
    el.addEventListener("focusout", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
      el.removeEventListener("focusin", apply);
      el.removeEventListener("focusout", apply);
      window.removeEventListener("orientationchange", apply);
      root.removeAttribute("data-builder-keyboard");
      for (const name of ["--builder-keyboard-inset", "--builder-vv-top", "--builder-vv-height"]) root.style.removeProperty(name);
    };
  }, [ref]);
}
