import { describe, expect, it } from "vitest";
import { buildCustomerJsonLd } from "@/lib/customer-schema";

describe("verified customer JSON-LD", () => {
  it("emits only verified business, service and FAQ data", () => {
    const graph = buildCustomerJsonLd({
      businessName: "Example Electric",
      siteUrl: "https://example.com",
      phone: "(919) 555-0100",
      city: "Durham",
      state: "NC",
      country: "US",
      serviceArea: "Durham County",
      services: [
        { name: "Panel Upgrade", description: "Electrical panel service", starting_price: 1200 },
      ],
      faqs: [{ question: "Do you serve Durham?", answer: "Yes, Durham County." }],
    });

    expect(graph["@context"]).toBe("https://schema.org");
    const nodes = graph["@graph"] as Array<Record<string, unknown>>;
    expect(nodes[0]?.["@type"]).toEqual(["LocalBusiness", "ProfessionalService"]);
    expect(nodes[1]).toMatchObject({
      "@type": "Service",
      name: "Panel Upgrade",
      offers: { price: 1200, priceCurrency: "USD" },
    });
    expect(nodes[2]?.["@type"]).toBe("FAQPage");
    expect(JSON.stringify(graph)).not.toContain("fake certification");
  });

  it("omits unverifiable address and price fields when absent", () => {
    const graph = buildCustomerJsonLd({
      businessName: "Example Studio",
      siteUrl: "https://example.com",
      services: [{ name: "Consulting" }],
    });
    const nodes = graph["@graph"] as Array<Record<string, unknown>>;
    expect(nodes[0]?.["address"]).toBeUndefined();
    expect(nodes[1]).toBeUndefined();
  });
});
