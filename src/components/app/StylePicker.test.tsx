// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StylePicker } from "@/components/app/StylePicker";
import { resolvedStylePicks, styleProfilePatch } from "@/lib/builder/style-picks";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
function mount(profile: Record<string, unknown> | null, onChoose = vi.fn(), disabled = false) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<StylePicker profile={profile} disabled={disabled} onChoose={onChoose} />));
  return { el: host, onChoose };
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.querySelectorAll("link[data-style-picker-fonts]").forEach((l) => l.remove());
  root = null;
  host = null;
});

describe("StylePicker", () => {
  it("shows three look cards, each with a swatch, a font sample and the layout feel, plus Skip", () => {
    const { el } = mount(null);
    const cards = el.querySelectorAll<HTMLElement>('[role="radio"]');
    expect(cards).toHaveLength(3);
    resolvedStylePicks().forEach((pick, i) => {
      const card = cards[i]!;
      expect(card.textContent).toContain(pick.name);
      expect(card.textContent).toContain(pick.feel);
      expect(card.querySelectorAll("span[style*='background-color']")).toHaveLength(3);
      expect(card.querySelector<HTMLElement>("span[style*='font-family']")?.style.fontFamily).toContain(pick.pairing.display);
    });
    expect(el.textContent).toContain("Skip: let the AI choose");
    expect(el.querySelectorAll('[aria-checked="true"]')).toHaveLength(0);
  });

  it("tapping a card saves that look through the existing profile fields", () => {
    const { el, onChoose } = mount(null);
    act(() => el.querySelectorAll<HTMLElement>('[role="radio"]')[0]!.click());
    expect(onChoose).toHaveBeenCalledWith(styleProfilePatch(resolvedStylePicks()[0]!));
  });

  it("marks the saved look, and Skip clears it back to the AI's choice", () => {
    const pick = resolvedStylePicks()[1]!;
    const { el, onChoose } = mount(styleProfilePatch(pick));
    expect(el.querySelectorAll('[role="radio"]')[1]!.getAttribute("aria-checked")).toBe("true");
    const skip = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Skip"))!;
    act(() => skip.click());
    expect(onChoose).toHaveBeenCalledWith({ primary_color: null, secondary_color: null, accent_color: null, font_preference: null });
  });

  it("with nothing picked, Skip is the active default and changes nothing", () => {
    const { el, onChoose } = mount({ primary_color: "#abcdef" });
    const skip = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Skip"))! as HTMLButtonElement;
    expect(skip.getAttribute("aria-pressed")).toBe("true");
    expect(skip.disabled).toBe(true);
    act(() => skip.click());
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("is usable at 390px: one card per row, 44px targets, no fixed widths", () => {
    const { el } = mount(null);
    const group = el.querySelector('[role="radiogroup"]')!;
    expect(group.className).toContain("grid-cols-1");
    expect(group.className).toContain("sm:grid-cols-3");
    for (const card of el.querySelectorAll<HTMLElement>("button")) {
      expect(card.className).toContain("min-h-11");
      expect(card.className).not.toMatch(/\bw-\[\d+px\]|\bmin-w-\[/);
    }
  });

  it("is inert for someone who cannot manage the site", () => {
    const { el, onChoose } = mount(null, vi.fn(), true);
    act(() => el.querySelectorAll<HTMLElement>('[role="radio"]')[0]!.click());
    expect(onChoose).not.toHaveBeenCalled();
  });
});
