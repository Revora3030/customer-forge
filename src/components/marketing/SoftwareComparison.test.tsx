import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SoftwareComparison } from "@/components/marketing/SoftwareComparison";

describe("SoftwareComparison", () => {
  const html = renderToStaticMarkup(<SoftwareComparison />);

  it("shows the typical prices, their total and the first year on both sides", () => {
    expect(html).toContain("$377/mo");
    expect(html).toContain("$4,524");
    expect(html).toContain("$1,450");
    expect(html).toContain("$10,524");
    expect(html).toContain("$350 setup plus 11 paid months at $100; the first month is free.");
  });

  it("says plainly these are typical list prices and not the visitor's bill", () => {
    expect(html).toContain("Typical entry-level prices");
    expect(html).toContain("Not your bill");
    expect(html).toContain("your needs may not use every tool listed");
    expect(html).not.toMatch(/\bsave up to\b|\b9\d%/i);
  });

  it("is a real table with headers", () => {
    expect(html).toContain("<caption");
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
  });
});
