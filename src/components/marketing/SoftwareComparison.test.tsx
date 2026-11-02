import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SoftwareComparison } from "@/components/marketing/SoftwareComparison";

describe("SoftwareComparison", () => {
  const html = renderToStaticMarkup(<SoftwareComparison />);

  it("shows only the verified prices, their total and the first year on both sides", () => {
    expect(html).toContain("$107.19/mo");
    expect(html).toContain("$1,286.28");
    expect(html).toContain("$1,450");
    expect(html).toContain("$350 setup plus 11 paid months at $100; the first month is free.");
    expect(html).not.toContain("$377");
    expect(html).not.toContain("$4,524");
    expect(html).not.toContain("$10,524");
  });

  it("says plainly when the tools alone cost less than Revora instead of claiming a saving", () => {
    expect(html).toContain("the tools alone cost about $164 less over the first 12 months than Revora does");
    expect(html).not.toMatch(/\bsave up to\b|\b9\d%|\bsaves?\b/i);
  });

  it("renders the sources note with the check date and a link to each vendor's pricing page", () => {
    expect(html).toContain("Prices from public pricing pages, checked Oct 31, 2026");
    for (const url of [
      "https://www.squarespace.com/pricing",
      "https://calendly.com/pricing",
      "https://www.jotform.com/pricing/",
      "https://www.pipedrive.com/en/pricing",
      "https://www.constantcontact.com/pricing",
      "https://zapier.com/pricing",
    ]) {
      expect(html).toContain(`href="${url}"`);
    }
  });

  it("leaves out tools with no public price and says so, naming no vendor for them", () => {
    expect(html).toContain("Review requests and Web agency or freelancer retainer are left out");
    expect(html).not.toMatch(/Podium|Birdeye|Wix|Webflow|Typeform|Mailchimp|HubSpot|Acuity/);
    expect(html).toContain("Not your bill");
    expect(html).toContain("your needs may not use every tool listed");
  });

  it("is a real table with headers", () => {
    expect(html).toContain("<caption");
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
  });
});
