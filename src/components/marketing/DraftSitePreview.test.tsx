import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DraftSitePreview, draftLocation, draftServiceList } from "./DraftSitePreview";

describe("DraftSitePreview", () => {
  it("builds the draft only from the visitor's own answers and labels it a draft", () => {
    const html = renderToStaticMarkup(
      <DraftSitePreview
        businessName="Triangle Detailing"
        businessType="Mobile detailing"
        city="Raleigh"
        state="NC"
        services="Interior detail, ceramic coating"
      />,
    );
    expect(html).toContain("Triangle Detailing");
    expect(html).toContain("Mobile detailing");
    expect(html).toContain("Raleigh, NC");
    expect(html).toContain("ceramic coating");
    expect(html).toContain("Draft preview, for illustration only");
    const text = html.replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(/one-time|24\/7|\bbest\b|testimonial|\d+ (customers|reviews)|\bstars?\b/i);
  });

  it("works with only the three quick answers", () => {
    const html = renderToStaticMarkup(
      <DraftSitePreview businessName="Acme HVAC" businessType="HVAC" city="Cary" />,
    );
    expect(html).toContain("Acme HVAC");
    expect(html).toContain("Cary");
    expect(html).toContain("Add them in the website builder");
  });

  it("splits and caps services", () => {
    expect(draftServiceList("a, b;\n c ,, ")).toEqual(["a", "b", "c"]);
    expect(draftServiceList("1,2,3,4,5,6,7,8")).toHaveLength(6);
    expect(draftLocation(" Raleigh ", "")).toBe("Raleigh");
  });
});
