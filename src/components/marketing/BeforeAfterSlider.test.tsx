import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BeforeAfterSlider } from "./BeforeAfterSlider";

describe("BeforeAfterSlider", () => {
  const html = renderToStaticMarkup(<BeforeAfterSlider />);

  it("is labelled as an illustrative example", () => {
    expect(html).toContain("Illustrative example");
    expect(html).toContain("not a real customer");
  });

  it("exposes a keyboard-focusable slider with value attributes", () => {
    expect(html).toMatch(/role="slider"[^>]*tabindex="0"/);
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-valuenow="50"');
  });

  it("shows no metrics, testimonials or ratings", () => {
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(
      /\d+\s?%\s*(more|increase|faster|growth)|\d+x\b|testimonial|stars?\b|reviews?\b|\$\d/i,
    );
  });
});
