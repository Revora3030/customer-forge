import { describe, expect, it } from "vitest";
import { normalizePlace } from "./prospect-finder";
import { hoursRecord, parseProspectDemoInput } from "./jarvis-demo-site";

// The real Woods Auto Detail listing (Graham, NC) has no Google category, only generic tags.
const woods = {
  id: "ChIJc1Goi8mw7iERHqShJULg-gM",
  types: ["point_of_interest", "establishment"],
  nationalPhoneNumber: "(919) 748-0659",
  formattedAddress: "1409 Crawford Rd, Graham, NC 27253, USA",
  regularOpeningHours: { weekdayDescriptions: ["Monday: 4:00 – 11:00 PM", "Sunday: Closed"] },
  businessStatus: "OPERATIONAL",
  displayName: { text: "Woods Auto Detail" },
};

describe("Google Maps listing facts", () => {
  it("keeps hours and address, and leaves the category empty when Google lists none", () => {
    const place = normalizePlace(woods)!;
    expect(place.category).toBeNull();
    expect(place.hours).toEqual(["Monday: 4:00 – 11:00 PM", "Sunday: Closed"]);
    expect(place.address).toBe("1409 Crawford Rd, Graham, NC 27253, USA");
  });

  it("uses a specific type tag when there is no display category", () => {
    expect(normalizePlace({ ...woods, types: ["car_wash", "establishment"] })!.category).toBe("Car wash");
  });

  it("accepts a demo with no services by describing the trade and city", () => {
    const input = parseProspectDemoInput({ businessName: "Woods Auto Detail", industry: "Auto detailing", city: "Graham", state: "NC", hours: ["Monday: 4:00 – 11:00 PM", "nonsense"] });
    expect(input.description).toBe("Auto detailing serving Graham, NC.");
    expect(input.hours).toEqual(["Monday: 4:00 – 11:00 PM"]);
    expect(hoursRecord(input.hours)).toEqual({ Monday: "4:00 – 11:00 PM" });
  });

  it("still rejects a demo with no trade", () => {
    expect(() => parseProspectDemoInput({ businessName: "Woods Auto Detail", city: "Graham" })).toThrow(/trade or category/);
  });
});
