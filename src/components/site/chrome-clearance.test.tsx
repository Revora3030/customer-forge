// @vitest-environment jsdom
/** Elite Mobile Detailing 390px QA: sticky header / bottom bar clearance and hero scrim floor. */
import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { CHROME_CLEARANCE_CSS } from "@/components/site/chrome-clearance";
import { CINEMATIC_CSS } from "@/components/site/cinematic-css";
import { PREMIUM_CSS } from "@/components/site/premium/premium-css";
import { useHeaderOffset } from "@/components/site/use-header-offset";
import { contrastRatio } from "@/lib/readable-color";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("scroll clearance for sticky chrome", () => {
  it("reserves the measured header height at the top, for the premium and the standard header", () => {
    expect(CHROME_CLEARANCE_CSS).toContain("html:has(.pm-header,.rv-site-header){scroll-padding-top:calc(var(--rv-header-height,72px) + 8px)}");
  });
  it("reserves the measured bar height plus the safe-area inset at the bottom, on phones only", () => {
    expect(CHROME_CLEARANCE_CSS).toMatch(/@media \(max-width:767px\)\{html:has\(\.rv-cn-mobile-sticky-bar\)\{scroll-padding-bottom:calc\(var\(--rv-sticky-height,72px\) \+ env\(safe-area-inset-bottom,0px\)/);
  });
  it("is part of the premium sheet, which the composition renderer also ships", () => {
    expect(PREMIUM_CSS).toContain(CHROME_CLEARANCE_CSS.trim());
  });
  it("keeps the end-of-page clearance for the bar in both renderers (height + safe area)", () => {
    expect(CINEMATIC_CSS).toMatch(/html:has\(\.rv-cn-mobile-sticky-bar[^)]*\) body\{padding-bottom:calc\(max\(var\(--rv-sticky-height,84px\),84px\) \+ env\(safe-area-inset-bottom/);
    expect(PREMIUM_CSS).toMatch(/\.pm-root\{[^}]*padding-bottom:calc\(var\(--rv-sticky-height,0px\) \+ env\(safe-area-inset-bottom/);
  });
});

describe("useHeaderOffset", () => {
  it("publishes the header's height on <html> and removes it on unmount", async () => {
    function Page() {
      const ref = useRef<HTMLElement>(null);
      useHeaderOffset(ref);
      return <header ref={ref}>menu</header>;
    }
    const proto = HTMLElement.prototype;
    const original = proto.getBoundingClientRect;
    proto.getBoundingClientRect = () => ({ height: 67.2, width: 390, top: 0, left: 0, right: 390, bottom: 67.2, x: 0, y: 0, toJSON: () => ({}) });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<Page />));
    expect(document.documentElement.style.getPropertyValue("--rv-header-height")).toBe("68px");
    await act(async () => root.unmount());
    expect(document.documentElement.style.getPropertyValue("--rv-header-height")).toBe("");
    proto.getBoundingClientRect = original;
    host.remove();
  });
});

/** The darkest alpha stop of a premium hero scrim, over the part of the frame the copy occupies. */
function stops(css: string, rule: string): Array<{ at: number; alpha: number }> {
  const body = css.slice(css.indexOf(rule));
  const gradient = /linear-gradient\((?:180|90)deg,([^;}]*)\)/.exec(body)![1]!;
  return [...gradient.matchAll(/rgb\(4 6 10 \/ \.(\d+)\) (\d+)%/g)].map((m) => ({ alpha: Number(`0.${m[1]}`), at: Number(m[2]) }));
}

describe("hero text on a photo (premium template scrim)", () => {
  // Worst case: a pure-white photo pixel under the scrim.
  const over = (alpha: number) => {
    const c = (channel: number) => Math.round(255 * (1 - alpha) + channel * alpha).toString(16).padStart(2, "0");
    return `#${c(4)}${c(6)}${c(10)}`;
  };
  const headline = "#f4f6f9"; // --foreground of the premium dark theme
  const lede = "#d6d9de"; // the lede paints at 80% of it, never lighter than this on the dark scrim

  it("phone: every stop that sits under the copy keeps headline and lede at 4.5:1 or more on a white photo", () => {
    const phone = stops(PREMIUM_CSS, ".pm-hero-scrim{position:absolute");
    expect(phone.length).toBeGreaterThanOrEqual(3);
    for (const stop of phone) {
      expect(contrastRatio(headline, over(stop.alpha))!, `${stop.at}%`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(lede, over(stop.alpha))!, `${stop.at}%`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("desktop: the left 80% of the frame, where the copy column sits, clears 4.5:1 too", () => {
    const wide = stops(PREMIUM_CSS, "@media (min-width:1024px){.pm-hero-scrim");
    const under = wide.filter((stop) => stop.at <= 80);
    expect(under.length).toBeGreaterThanOrEqual(3);
    for (const stop of under) expect(contrastRatio(lede, over(stop.alpha))!, `${stop.at}%`).toBeGreaterThanOrEqual(4.5);
  });
  it("the old 35% and 25% stops are gone", () => {
    expect(PREMIUM_CSS).not.toContain("rgb(4 6 10 / .35) 30%");
    expect(PREMIUM_CSS).not.toContain("rgb(4 6 10 / .25) 75%");
  });
});
