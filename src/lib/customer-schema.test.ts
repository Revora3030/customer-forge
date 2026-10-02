import { describe, expect, it } from "vitest";
import { buildVerifiedCustomerSchema } from "@/lib/customer-schema";

describe("verified customer JSON-LD", () => {
  it("contains only supplied business facts and supported schema types", () => {
    const schema = buildVerifiedCustomerSchema({
      businessName: "Acme Detail",
      phone: "555-0100",
      city: "Durham",
      region: "NC",
      siteUrl: "https://example.com/acme",
      services: [
        {
          name: "Full Detail",
          description: "Interior and exterior detailing.",
          starting_price: 199,
        },
      ],
      faqs: [{ question: "Do you detail cars?", answer: "Yes." }],
    });

    const graph = schema["@graph"] as Array<Record<string, unknown>>;
    expect(graph[0]?.["@type"]).toEqual(["LocalBusiness", "ProfessionalService"]);
    expect(graph).toHaveLength(3);
    expect((graph[1] as Record<string, unknown>).name).toBe("Full Detail");
    expect((graph[1] as Record<string, unknown>).offers).toEqual({
      "@type": "Offer",
      price: 199,
      priceCurrency: "USD",
    });
    expect(JSON.stringify(schema)).not.toContain("award");
    expect(JSON.stringify(schema)).not.toContain("rating");
  });

  it("does not invent an address or price when the facts are absent", () => {
    const schema = buildVerifiedCustomerSchema({
      businessName: "Acme Detail",
      siteUrl: "https://example.com/acme",
      services: [{ name: "Detailing" }],
    });

    const graph = schema["@graph"] as Array<Record<string, unknown>>;
    expect(graph[0]?.address).toBeUndefined();
    expect((graph[1] as Record<string, unknown>).offers).toBeUndefined();
  });
});
