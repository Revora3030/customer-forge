import { describe, expect, it } from "vitest";
import { parseProspectDemoInput } from "./jarvis-demo-site";
import { parseActions } from "./jarvis-actions";
import { prospectDemoInput, selectProspects, webPresence } from "./prospect-finder";

const place = (overrides: Record<string, unknown>) => ({
  id: "p1",
  displayName: { text: "Shine Mobile Detailing" },
  formattedAddress: "12 Main St, Raleigh, NC 27601, USA",
  addressComponents: [
    { longText: "Raleigh", shortText: "Raleigh", types: ["locality", "political"] },
    { longText: "North Carolina", shortText: "NC", types: ["administrative_area_level_1", "political"] },
  ],
  nationalPhoneNumber: "(919) 555-0142",
  primaryTypeDisplayName: { text: "Car detailing service" },
  businessStatus: "OPERATIONAL",
  rating: 4.8,
  userRatingCount: 31,
  ...overrides,
});

describe("webPresence", () => {
  it("treats social and directory pages as no real website", () => {
    expect(webPresence(null)).toBe("none");
    expect(webPresence("https://www.facebook.com/shine")).toBe("social_only");
    expect(webPresence("instagram.com/shine")).toBe("social_only");
    expect(webPresence("https://shine-detailing.business.site")).toBe("social_only");
    expect(webPresence("https://shinedetailing.com")).toBe("has_website");
  });
});

describe("selectProspects", () => {
  it("keeps businesses without a real website and reads city and state", () => {
    const out = selectProspects([
      place({}),
      place({ id: "p2", displayName: { text: "Has A Site LLC" }, websiteUri: "https://hasasite.com" }),
      place({ id: "p3", displayName: { text: "Closed Co" }, businessStatus: "CLOSED_PERMANENTLY" }),
      place({ id: "p4", displayName: { text: "Social Only" }, websiteUri: "https://facebook.com/social" }),
    ]);
    expect(out.map((p) => p.name)).toEqual(["Shine Mobile Detailing", "Social Only"]);
    expect(out[0]).toMatchObject({ city: "Raleigh", state: "NC", presence: "none" });
  });

  it("skips businesses that already have a demo, duplicates and listings without a city", () => {
    expect(selectProspects([place({})], ["shine mobile detailing"])).toEqual([]);
    expect(selectProspects([place({}), place({ id: "p9" })])).toHaveLength(1);
    expect(selectProspects([place({ addressComponents: [] })])).toEqual([]);
  });
});

describe("prospectDemoInput", () => {
  it("builds a valid demo request from listing facts only", () => {
    const [prospect] = selectProspects([place({})]);
    const input = prospectDemoInput(prospect!, "mobile detailing");
    expect(input).toMatchObject({ businessName: "Shine Mobile Detailing", industry: "Car detailing service", city: "Raleigh", state: "NC", phone: "(919) 555-0142", email: null, services: [] });
    expect(() => parseProspectDemoInput(input)).not.toThrow();
  });
});

describe("Jarvis prospects.find action", () => {
  it("is a bounded read that needs a niche and city", () => {
    const ok = parseActions([{ id: "prospects.find", args: { niche: "mobile detailing", city: "Raleigh", state: "NC" } }], []);
    expect(ok.reads).toEqual([{ id: "prospects.find", niche: "mobile detailing", city: "Raleigh", state: "NC" }]);
    expect(parseActions([{ id: "prospects.find", args: { niche: "x" } }], []).rejected[0]).toMatch(/niche and a city/);
  });
});
