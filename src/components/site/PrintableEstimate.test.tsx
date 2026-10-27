import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PrintableEstimate } from "./PrintableEstimate";

const html = renderToStaticMarkup(
  <PrintableEstimate
    businessName="Northside Plumbing"
    title="Water heater estimate"
    min={1200}
    max={1800}
    lines={[{ question: "Heater type", answer: "Tankless" }]}
    extras={[{ label: "Old unit removal", price: 150 }]}
    date={new Date("2026-10-27T12:00:00Z")}
  />,
);

describe("PrintableEstimate", () => {
  it("restates the visitor's choices and the range they were shown", () => {
    expect(html).toContain("Heater type");
    expect(html).toContain("Tankless");
    expect(html).toContain("Extra: Old unit removal");
    expect(html).toContain("$1,200");
    expect(html).toContain("$1,800");
    expect(html).toContain("October 27, 2026");
  });

  it("says it is an estimate, not a quote or contract, and names the business that confirms it", () => {
    expect(html).toContain("not a quote or contract");
    expect(html).toContain("Northside Plumbing confirms the final price");
  });

  it("marks the printable area and keeps the print button out of the printout", () => {
    expect(html).toContain("data-print-estimate");
    expect(html).toContain("print-hide");
    expect(html).toContain("Print or save as PDF");
  });
});
