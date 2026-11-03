import { describe, expect, it } from "vitest";
import { describeFactViolations, findInventedFacts, ownerFillMarker, ownerFillPlan, OWNER_FILL_MARKERS, type IntakeFacts } from "./facts-guard";

const intake: IntakeFacts = {
  businessName: "Test Plumbing Co",
  phone: "(919) 321-4567",
  email: "office@testplumbing.co",
  city: "Raleigh",
  hours: "Mon-Fri 8-5",
  services: [{ name: "Drain cleaning", price: "$150" }, { name: "Water heaters" }],
  photos: ["https://cdn.example.net/p1.jpg"],
  ownerText: "We are licensed and insured. Free estimates.",
  credentials: ["Licensed and insured"],
};

describe("ownerFillPlan", () => {
  it("uses the owner's values and flags nothing when intake is complete", () => {
    const plan = ownerFillPlan({ ...intake, address: "1 Main St", description: "A local plumber." });
    expect(plan.flags).toEqual([]);
    expect(plan.display.phone).toBe("(919) 321-4567");
    expect(plan.readyToShow).toBe(true);
  });

  it("turns every missing field into a visible marker and a data flag, never an invented value", () => {
    const plan = ownerFillPlan({ businessName: "Acme Roofing" });
    expect(plan.display.phone).toBe("[Add your phone]");
    expect(plan.display.hours).toBe("[Add your hours]");
    const fields = plan.flags.map((f) => f.field).sort();
    expect(fields).toEqual(["address", "description", "email", "hours", "phone", "photos", "serviceArea", "services"]);
    expect(plan.readyToShow).toBe(false);
    expect(plan.values.phone).toBeNull();
  });

  it("withholds a fixture phone or example email and says why", () => {
    const plan = ownerFillPlan({ businessName: "X Co", phone: "555-0100", email: "me@example.com", services: [{ name: "A" }] });
    expect(plan.values.phone).toBeNull();
    expect(plan.values.email).toBeNull();
    expect(plan.flags.find((f) => f.field === "phone")?.reason).toBe("placeholder_value");
  });

  it("needs a business name and at least one service before a draft is shown as ready", () => {
    expect(ownerFillPlan({ phone: "919-321-4567" }).readyToShow).toBe(false);
    expect(ownerFillPlan({ businessName: "Z", services: [{ name: "Cuts" }] }).readyToShow).toBe(true);
  });

  it("exposes its markers", () => {
    expect(OWNER_FILL_MARKERS).toContain(ownerFillMarker("phone"));
  });
});

describe("findInventedFacts", () => {
  const scan = (text: string, facts: IntakeFacts = intake) => findInventedFacts([{ id: "s1", text }], facts);
  const kinds = (text: string, facts?: IntakeFacts) => scan(text, facts).map((v) => v.kind);

  it("passes copy that only uses the owner's facts", () => {
    expect(scan("Call (919) 321-4567 or email office@testplumbing.co. Drain cleaning from $150. We are licensed and insured.")).toEqual([]);
    expect(scan("Call 919.321.4567 today")).toEqual([]);
  });

  it("ignores owner-fill markers", () => {
    expect(scan("Call [Add your phone] or write [Add your email]", {})).toEqual([]);
  });

  it("flags a phone that is not the owner's, and 555 numbers", () => {
    expect(kinds("Call 919-555-0147 now")).toEqual(["fake_phone"]);
    expect(kinds("Call 984-222-7788 now")).toEqual(["phone"]);
    expect(kinds("Call 984-222-7788 now", {})).toEqual(["phone"]);
  });

  it("flags other and example emails", () => {
    expect(kinds("Write info@yourcompany.com")).toEqual(["email"]);
    expect(kinds("Write hello@example.com")).toEqual(["example_email"]);
    expect(kinds("Write hello@mybiz.test")).toEqual(["example_email"]);
  });

  it("flags prices that are not in the intake, allows the owner's", () => {
    expect(kinds("Drain cleaning from $150")).toEqual([]);
    expect(kinds("Starting at $99")).toEqual(["price"]);
    expect(kinds("Starting at $1.5k")).toEqual(["price"]);
  });

  it("flags ratings and review counts unless the owner gave them", () => {
    expect(kinds("Rated 4.9 stars by customers")).toContain("rating");
    expect(kinds("5-star service")).toContain("rating");
    expect(kinds("Over 200 reviews")).toEqual(["review_count"]);
    expect(kinds("4.8 stars from 120 reviews", { ...intake, rating: 4.8, reviewCount: 120 })).toEqual([]);
    expect(kinds("4.9 stars", { ...intake, rating: 4.8 })).toContain("rating");
  });

  it("flags years-in-business claims and awards, but not a plain warranty length", () => {
    expect(kinds("25 years of experience")).toEqual(["years_in_business"]);
    expect(kinds("Serving Raleigh since 1998")).toEqual(["years_in_business"]);
    expect(kinds("A 2 year warranty on parts")).toEqual([]);
    expect(kinds("Since 2005", { ...intake, foundedYear: 2005 })).toEqual([]);
    expect(kinds("Award-winning service")).toEqual(["award"]);
    expect(kinds("Award-winning service", { ...intake, awards: ["Award-winning"] })).toEqual([]);
  });

  it("flags licence and insurance claims only when the owner did not give them", () => {
    expect(kinds("Fully licensed and insured", { businessName: "X" })).toContain("credential");
    expect(kinds("Licensed and insured")).toEqual([]);
  });

  it("reports the part id so only that part is regenerated", () => {
    const found = findInventedFacts([{ id: "hero", text: "Welcome" }, { id: "contact", text: "Call 984-222-7788" }], intake);
    expect(found.map((f) => f.partId)).toEqual(["contact"]);
    expect(describeFactViolations(found)[0]).toContain("contact");
  });
});
