// @vitest-environment jsdom
/** Item 18: demo disclaimer is always visible, unhideable by site CSS, readable at 390px. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { DemoPreviewLabel } from "@/components/site/DemoPreviewLabel";
import { DEMO_PREVIEW_LABEL_TEXT } from "@/lib/demo-preview-label";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

async function mount(width = 390) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  host = document.createElement("div");
  // Hostile generated-site stylesheet: tries to hide banners / status regions.
  const style = document.createElement("style");
  style.textContent = `
    [role="status"], [data-revora-demo-label] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      max-height: 0 !important;
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<DemoPreviewLabel />);
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.head.querySelectorAll("style").forEach((n) => n.remove());
});

describe("DemoPreviewLabel", () => {
  it("renders the exact disclaimer text at 390px", async () => {
    const el = await mount(390);
    const label = el.querySelector("[data-revora-demo-label]") as HTMLElement;
    expect(label).toBeTruthy();
    expect(label.textContent).toBe(DEMO_PREVIEW_LABEL_TEXT);
    expect(label.style.getPropertyValue("position")).toBe("fixed");
    expect(label.style.getPropertyPriority("position")).toBe("important");
    expect(Number(label.style.getPropertyValue("z-index"))).toBeGreaterThanOrEqual(2147483646);
    expect(Number.parseInt(label.style.getPropertyValue("font-size"), 10)).toBeGreaterThanOrEqual(12);
  });

  it("wins against generated site CSS that tries to hide it", async () => {
    const el = await mount(390);
    const label = el.querySelector("[data-revora-demo-label]") as HTMLElement;
    expect(label.style.getPropertyValue("display")).toBe("flex");
    expect(label.style.getPropertyPriority("display")).toBe("important");
    expect(label.style.getPropertyValue("visibility")).toBe("visible");
    expect(label.style.getPropertyPriority("visibility")).toBe("important");
    expect(label.style.getPropertyValue("opacity")).toBe("1");
  });
});
