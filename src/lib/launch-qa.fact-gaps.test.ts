import { describe, expect, it } from "vitest";
import { requiredFactGaps, type FactInput } from "@/lib/launch-qa";

const complete: FactInput = {
  businessName: "Northline Auto Studio",
  description: "Premium mobile auto detailing for drivers across Raleigh.",
  phone: "9195550123",
  email: "hello@northline.test",
  city: "Raleigh",
  serviceArea: "Raleigh",
  servicesCount: 2,
  serviceNames: ["Interior detailing", "Ceramic coating"],
  photoCount: 0,
  hasHours: false,
  briefRequests: [],
};

describe("first-build fact quality", () => {
  it("accepts concise but meaningful business facts", () => {
    expect(requiredFactGaps(complete)).toEqual([]);
  });

  it("blocks template debris and unusably vague service input", () => {
    const gaps = requiredFactGaps({
      ...complete,
      businessName: "My Business",
      description: "Ejejs",
      servicesCount: 1,
      serviceNames: ["Full"],
    });
    expect(gaps.map((gap) => gap.key)).toEqual(
      expect.arrayContaining(["business-name", "description", "services"]),
    );
  });

  it("blocks repeated keyboard-like filler without rejecting normal short brands", () => {
    expect(requiredFactGaps({ ...complete, businessName: "ABBA" })).toEqual([]);
    expect(requiredFactGaps({ ...complete, businessName: "asdasd" }).map((gap) => gap.key)).toContain(
      "business-name",
    );
  });
});