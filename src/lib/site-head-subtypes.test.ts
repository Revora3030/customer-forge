import { describe, expect, it } from "vitest";

import { TRADE_PLAYBOOKS } from "@/lib/builder/industry-playbook";
import {
  LOCAL_BUSINESS_PARENT,
  localBusinessSchema,
  resolveSchemaType,
  schemaTypeValue,
  type LocalBusinessType,
} from "./site-head";

/** Walks a type's parents; throws on a loop or an unknown parent. */
function chain(type: LocalBusinessType): LocalBusinessType[] {
  const out: LocalBusinessType[] = [type];
  let current: LocalBusinessType | null = LOCAL_BUSINESS_PARENT[type];
  while (current) {
    if (out.includes(current)) throw new Error(`loop at ${current}`);
    out.push(current);
    current = LOCAL_BUSINESS_PARENT[current];
  }
  return out;
}

// A spread of real industry phrases, including every branch inside a trade.
const INDUSTRIES = [
  "Plumbing", "HVAC repair", "Roofing contractor", "Electrician", "Locksmith", "House painting", "General contractor",
  "Moving company", "Auto repair", "Collision and auto body", "Mobile auto detailing", "Towing", "House cleaning",
  "Commercial janitorial", "Pressure washing", "Window cleaning", "Gutter cleaning", "Landscaping", "Tree service",
  "Lawn mowing", "Pest control", "Pool service", "Garage door repair", "Appliance repair", "Solar installer",
  "Italian restaurant", "Bakery", "Coffee shop", "Brewery", "Sports bar", "Nail salon", "Tattoo studio", "Day spa",
  "Barber shop", "Beauty studio", "Med spa", "Family dentistry", "Veterinary clinic", "Optometrist", "Chiropractor",
  "Urgent care", "Gym", "Personal injury law firm", "Real estate agent", "CPA tax preparation", "Insurance agency",
  "Wealth advisor", "Marketing consultant", "Wedding photographer", "Daycare", "Tutoring center", "Mystery business",
];

describe("typed LocalBusiness subtypes", () => {
  it("every mapped type climbs to LocalBusiness without loops", () => {
    for (const type of Object.keys(LOCAL_BUSINESS_PARENT) as LocalBusinessType[]) {
      expect(chain(type).at(-1), type).toBe("LocalBusiness");
    }
  });

  it("every industry, and every trade playbook label, resolves to a mapped LocalBusiness subtype", () => {
    const labels = TRADE_PLAYBOOKS.map((p) => (p as { label?: string }).label ?? "").filter(Boolean);
    for (const industry of [...INDUSTRIES, ...labels]) {
      const resolved = resolveSchemaType(industry);
      expect(Object.hasOwn(LOCAL_BUSINESS_PARENT, resolved.type), `${industry} -> ${resolved.type}`).toBe(true);
    }
  });

  it.each([
    ["Plumbing", "Plumber", "HomeAndConstructionBusiness"],
    ["Roofing contractor", "RoofingContractor", "HomeAndConstructionBusiness"],
    ["Auto repair", "AutoRepair", "AutomotiveBusiness"],
    ["Collision and auto body", "AutoBodyShop", "AutomotiveBusiness"],
    ["Coffee shop", "CafeOrCoffeeShop", "FoodEstablishment"],
    ["CPA tax preparation", "AccountingService", "FinancialService"],
  ])("%s -> %s under %s", (industry, type, parent) => {
    const resolved = resolveSchemaType(industry);
    expect(resolved.type).toBe(type);
    expect(LOCAL_BUSINESS_PARENT[resolved.type]).toBe(parent);
  });

  it("keeps veterinary care eligible as a local business by pairing it with MedicalBusiness", () => {
    const resolved = resolveSchemaType("Vet clinic");
    expect(resolved).toEqual({ type: "MedicalBusiness", alsoType: "VeterinaryCare" });
    expect(schemaTypeValue(resolved)).toEqual(["VeterinaryCare", "MedicalBusiness"]);
    const schema = localBusinessSchema({ name: "Paws", url: "https://paws.example", profile: {}, industry: "Vet clinic" });
    expect(schema["@type"]).toEqual(["VeterinaryCare", "MedicalBusiness"]);
  });

  it("emits a single string @type for ordinary subtypes", () => {
    const schema = localBusinessSchema({ name: "Acme", url: "https://acme.example", profile: {}, industry: "Plumbing" });
    expect(schema["@type"]).toBe("Plumber");
    expect(schemaTypeValue({ type: "LocalBusiness" })).toBe("LocalBusiness");
  });
});
