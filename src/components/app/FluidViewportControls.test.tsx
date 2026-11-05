/** Rendered contract for the B13-5 slider and badges (renderToStaticMarkup, no DOM library in this repo). */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FluidBadges, FluidViewportSlider } from "./FluidViewportControls";

describe("FluidViewportSlider", () => {
  it("renders a labelled 320 to 1440 slider with the current width", () => {
    const html = renderToStaticMarkup(<FluidViewportSlider width={512} onChange={() => undefined} />);
    expect(html).toContain('aria-label="Preview width in pixels"');
    expect(html).toContain('aria-valuemin="320"');
    expect(html).toContain('aria-valuemax="1440"');
    expect(html).toContain("right:82.8");
    expect(html).toContain("512px");
  });

  it("pins the thumb at 1440 for a wider preset but still shows the real width", () => {
    const html = renderToStaticMarkup(<FluidViewportSlider width={2560} onChange={() => undefined} />);
    expect(html).toContain("right:0%");
    expect(html).toContain("2560px");
  });
});

describe("FluidBadges", () => {
  it("shows NOT MEASURED, and no number, before the preview reports anything", () => {
    const html = renderToStaticMarkup(<FluidBadges viewportWidth={390} overflow={null} taps={null} />);
    expect(html).toContain("Sideways scroll: NOT MEASURED");
    expect(html).toContain("Tap targets: NOT MEASURED");
    expect(html).not.toContain("under 44px");
    expect(html).not.toContain("No sideways scroll");
  });

  it("shows measured values only", () => {
    const html = renderToStaticMarkup(
      <FluidBadges
        viewportWidth={390}
        overflow={{ overflow: true, clientWidth: 390, scrollWidth: 450, culprits: [] }}
        taps={{ checked: 10, smallCount: 2, smallest: 30, clientWidth: 390, examples: [] }}
      />,
    );
    expect(html).toContain("Horizontal scroll detected at 390px");
    expect(html).toContain("2 tap targets under 44px");
    expect(html).not.toContain("NOT MEASURED");
  });
});
