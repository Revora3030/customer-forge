/** Rendered with renderToStaticMarkup: this repo has no DOM test library. */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextStepChips } from "./NextStepChips";

describe("NextStepChips", () => {
  it("renders nothing without chips", () => {
    expect(renderToStaticMarkup(<NextStepChips chips={[]} onPick={() => {}} />)).toBe("");
  });

  it("renders a labelled group of real buttons with the reason as a title", () => {
    const html = renderToStaticMarkup(
      <NextStepChips
        chips={[{ id: "history", label: "Compare before and after", reason: "History keeps it", action: { kind: "history" } }]}
        disabled
        onPick={() => {}}
      />,
    );
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Next steps"');
    expect(html).toContain('type="button"');
    expect(html).toContain('title="History keeps it"');
    expect(html).toContain("disabled");
    expect(html).toContain("Compare before and after");
    expect(html).toContain("min-h-9");
  });
});
