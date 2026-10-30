import { describe, expect, it } from "vitest";
import { localBusinessSchema, priceRangeFrom, resolveSchemaType } from "./site-head";

describe("resolveSchemaType", () => {
  it.each([
    ["Plumbing", "Plumber"],
    ["HVAC repair", "HVACBusiness"],
    ["Roofing contractor", "RoofingContractor"],
    ["Mobile auto detailing", "AutoRepair"],
    ["House cleaning", "HomeAndConstructionBusiness"],
    ["Pressure washing", "HomeAndConstructionBusiness"],
    ["Landscaping", "HomeAndConstructionBusiness"],
    ["Italian restaurant", "Restaurant"],
    ["Barber shop", "HairSalon"],
    ["Med spa", "DaySpa"],
    ["Family dentistry", "Dentist"],
    ["Personal injury law firm", "LegalService"],
    ["Real estate agent", "RealEstateAgent"],
    ["Gym", "HealthClub"],
    ["Mystery business", "LocalBusiness"],
  ])("%s -> %s", (industry, type) => {
    expect(resolveSchemaType(industry).type).toBe(type);
  });

  it("gives non-specific trades a serviceType", () => {
    expect(resolveSchemaType("Pressure washing").serviceType).toBe("Pressure washing");
    expect(resolveSchemaType("Mobile auto detailing").serviceType).toBe("Auto detailing");
    expect(resolveSchemaType(null)).toEqual({ type: "LocalBusiness" });
  });
});

describe("localBusinessSchema", () => {
  const base = { name: "Acme", url: "https://acme.example" };
  it("uses the trade type, map link, social sameAs and real price range", () => {
    const schema = localBusinessSchema({
      ...base,
      industry: "Italian restaurant",
      profile: { address: "1 Main St", city: "Austin", state: "TX", zip: "78701" },
      services: [{ name: "A", price: 20 }, { name: "B", starting_price: "45" }],
      social: { instagram: "https://instagram.com/acme", facebook: "not a url" },
    });
    expect(schema["@type"]).toBe("Restaurant");
    expect(schema["servesCuisine"]).toBe("Italian");
    expect(String(schema["hasMap"])).toContain("1%20Main%20St");
    expect(schema["sameAs"]).toEqual(["https://instagram.com/acme"]);
    expect(schema["priceRange"]).toBe("$20-$45");
  });

  it("invents nothing without data", () => {
    const schema = localBusinessSchema({ ...base, profile: {} });
    expect(schema["@type"]).toBe("LocalBusiness");
    for (const key of ["hasMap", "priceRange", "sameAs", "geo", "aggregateRating", "servesCuisine"]) expect(schema[key]).toBeUndefined();
    expect(priceRangeFrom([])).toBeNull();
  });
});
