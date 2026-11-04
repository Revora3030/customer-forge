import { describe, expect, it } from "vitest";
import { tenantBrandFacts, tenantLlmsTxt } from "./tenant-llms";

const base = {
  name: "Oak City Roofing",
  siteUrl: "https://oakcityroofing.example/",
  industry: "roofing",
  pageSlugs: ["services", "about", "services", "../etc"],
  publishedAt: "2026-11-01T12:00:00.000Z",
};

describe("tenantBrandFacts", () => {
  it("keeps only verified facts and leaves unknown fields out", () => {
    const facts = tenantBrandFacts({
      ...base,
      profile: {
        description: "Roof repair and replacement in Raleigh.",
        phone: "(919) 832-0190",
        email: "hello@oakcityroofing.co",
        address: "12 Main St",
        city: "Raleigh",
        state: "NC",
        zip: "27601",
        hours: { mon: "8am-5pm", tue: "8-5" },
      },
      services: [
        { name: "Roof inspection", starting_price: 150 },
        { name: "Gutter guard", description: "Install\nand clean" },
      ],
    });
    expect(facts.url).toBe("https://oakcityroofing.example");
    expect(facts.address).toEqual({ streetAddress: "12 Main St", addressLocality: "Raleigh", addressRegion: "NC", postalCode: "27601" });
    expect(facts.openingHours).toEqual([
      { days: ["Monday"], opens: "08:00", closes: "17:00" },
      { days: ["Tuesday"], opens: "08:00", closes: "17:00" },
    ]);
    expect(facts.services[0]).toEqual({ name: "Roof inspection", startingPrice: "150.00", currency: "USD" });
    expect(facts.services[1]).toEqual({ name: "Gutter guard", description: "Install and clean" });
    expect(facts.pages.map((p) => p.url)).toEqual([
      "https://oakcityroofing.example/",
      "https://oakcityroofing.example/services",
      "https://oakcityroofing.example/about",
    ]);
  });

  it("never invents contact details, ratings or prices", () => {
    const facts = tenantBrandFacts({
      ...base,
      profile: { phone: "(555) 555-5555", email: "info@example.com" },
      services: [{ name: "Free estimate" }],
    });
    expect(facts.telephone).toBeUndefined();
    expect(facts.email).toBeUndefined();
    expect(facts.description).toBeUndefined();
    expect(facts.priceRange).toBeUndefined();
    expect(facts.services).toEqual([{ name: "Free estimate" }]);
    expect(JSON.stringify(facts)).not.toMatch(/aggregateRating|"reviews?":|"rating"|"award"/i);
  });
});

describe("tenantLlmsTxt", () => {
  it("renders the facts as llms.txt markdown with one-line owner text", () => {
    const text = tenantLlmsTxt(
      tenantBrandFacts({
        ...base,
        profile: { description: "Line one\n# not a heading", phone: "(919) 832-0190", service_area: "Wake County" },
        services: [{ name: "Roof repair", price: 499.5 }],
        social: { facebook: "https://facebook.com/oakcity", instagram: "http://insecure.example" },
      }),
    );
    expect(text.split("\n")[0]).toBe("# Oak City Roofing");
    expect(text).toContain("> Line one # not a heading");
    expect(text).toContain("- Business type: RoofingContractor");
    expect(text).toContain("- Service area: Wake County");
    expect(text).toContain("- Roof repair ($499.50)");
    expect(text).toContain("## Official profiles\n- https://facebook.com/oakcity");
    expect(text).not.toContain("insecure.example");
    expect(text).toContain("- https://oakcityroofing.example/sitemap.xml");
    expect(text).toContain("Last published: 2026-11-01T12:00:00.000Z");
  });

  it("omits empty sections rather than printing placeholders", () => {
    const text = tenantLlmsTxt(tenantBrandFacts({ name: "Bare", siteUrl: "https://bare.example", profile: null }));
    expect(text).not.toContain("## Business details");
    expect(text).not.toContain("## Services");
    expect(text).toContain("## Pages\n- https://bare.example/");
  });
});
