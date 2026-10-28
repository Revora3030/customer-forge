import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CustomBlock } from "@/components/site/CustomBlock";
import { parseCustomBlock } from "@/lib/builder/custom-block";

function render(raw: unknown): string {
  const parsed = parseCustomBlock(raw);
  if (!parsed.ok) throw new Error(parsed.reason);
  return renderToStaticMarkup(<CustomBlock spec={parsed.spec} />);
}

describe("selector block", () => {
  const html = render({
    type: "selector",
    title: "The right setting for every surface",
    figureLabel: "Pressure",
    items: [
      { label: "Concrete", figure: "3,000 PSI", level: 80, body: "Surface cleaner." },
      { label: "Vinyl siding", figure: "1,200 PSI" },
    ],
  });

  it("renders every choice as a 44px radio and starts on the first", () => {
    expect(html.match(/role="radio"/g)).toHaveLength(2);
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("min-h-11");
  });

  it("shows only the figures the spec supplied", () => {
    expect(html).toContain("3,000 PSI");
    expect(html).not.toContain("1,200 PSI</p>");
    expect(html).toContain("Pressure");
  });
});
