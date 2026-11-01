// @vitest-environment jsdom
/**
 * FIX-EVERYTHING #1: a visitor must never see the "0% · 1/2 · OPENING SURFACE
 * STUDY - WIDE" readout over the hero, and the copy must show even if every
 * frame image fails to load.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScrubSequence } from "@/components/site/CinematicBlocks";
import { CINEMATIC_CSS } from "@/components/site/cinematic-css";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
beforeEach(() => {
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined })) as never;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const frames = [
  { src: "/a.jpg", alt: "Wide shot", label: "Opening surface study - wide" },
  { src: "/b.jpg", alt: "Close shot", label: "Detail" },
];

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<ScrubSequence props={{ "data-cn": "", "data-motion": "", className: "", style: {} } as never} frames={frames} copy={<h1>Hello customers</h1>} prompt="Scroll" scrim="#101216" ink="#fff" />);
  });
  return host;
}

describe("ScrubSequence for a public visitor", () => {
  it("is live after hydration but prints no percent / step / chapter readout", () => {
    const el = mount();
    expect(el.querySelector(".rv-seq")?.hasAttribute("data-live")).toBe(true);
    expect(el.querySelector(".rv-seq-hud")).toBeNull();
    expect(el.textContent ?? "").not.toMatch(/\d+\s*%/);
    expect(el.textContent ?? "").not.toMatch(/\d\s*\/\s*\d\s*·/);
    // The chapter name only exists on its own tappable chip, never in a floating readout.
    const withLabel = [...el.querySelectorAll("*")].filter((n) => n.children.length === 0 && /opening surface study/i.test(n.textContent ?? ""));
    expect(withLabel.every((n) => n.tagName === "BUTTON")).toBe(true);
  });

  it("keeps the headline and a readable backdrop when no frame image ever loads", () => {
    const el = mount();
    act(() => {
      el.querySelectorAll("img").forEach((img) => img.dispatchEvent(new Event("error")));
    });
    expect(el.textContent).toContain("Hello customers");
    const stage = el.querySelector<HTMLElement>(".rv-seq-stage")!;
    expect(stage.style.backgroundColor).not.toBe("");
  });

  it("has no HUD styles shipped to visitors", () => {
    expect(CINEMATIC_CSS).not.toContain("rv-seq-hud");
  });
});
