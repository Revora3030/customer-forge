import { describe, expect, it } from "vitest";
import { MAX_DEMO_SERVICES, parseProspectDemoInput, parseServiceList, readProspectDemoMarker } from "./jarvis-demo-site";

const valid = {
  businessName: "  Triangle Comfort HVAC ",
  industry: "HVAC contractor",
  city: "Raleigh",
  state: "NC",
  phone: "(919) 555-0142",
  email: "Owner@Example.com",
  services: "AC repair, Furnace installation\nAC repair",
};

describe("parseProspectDemoInput", () => {
  it("normalizes a real business", () => {
    const parsed = parseProspectDemoInput(valid);
    expect(parsed.businessName).toBe("Triangle Comfort HVAC");
    expect(parsed.email).toBe("owner@example.com");
    expect(parsed.services).toEqual(["AC repair", "Furnace installation"]);
    expect(parsed.description).toBeNull();
  });

  it("requires name, category and city", () => {
    expect(() => parseProspectDemoInput({ ...valid, businessName: "" })).toThrow(/business name/);
    expect(() => parseProspectDemoInput({ ...valid, industry: "" })).toThrow(/trade/);
    expect(() => parseProspectDemoInput({ ...valid, city: "" })).toThrow(/city/);
  });

  it("with no services, describes only the stated trade and city, never invented services", () => {
    const bare = parseProspectDemoInput({ ...valid, services: "", description: "" });
    expect(bare.services).toEqual([]);
    expect(bare.description).toBe(`${bare.industry} serving ${[bare.city, bare.state].filter(Boolean).join(", ")}.`);
    const described = parseProspectDemoInput({
      ...valid,
      services: "",
      description: "Family-owned HVAC company serving Wake County.",
    });
    expect(described.services).toEqual([]);
  });

  it("rejects malformed contact details instead of storing them", () => {
    expect(() => parseProspectDemoInput({ ...valid, phone: "12" })).toThrow(/phone/);
    expect(() => parseProspectDemoInput({ ...valid, email: "not-an-email" })).toThrow(/email/);
    const blank = parseProspectDemoInput({ ...valid, phone: " ", email: "" });
    expect(blank.phone).toBeNull();
    expect(blank.email).toBeNull();
  });
});

describe("parseServiceList", () => {
  it("dedupes, drops fragments and caps the list", () => {
    const many = Array.from({ length: 20 }, (_, i) => `Service ${i}`);
    expect(parseServiceList(many)).toHaveLength(MAX_DEMO_SERVICES);
    expect(parseServiceList("ok, Roofing; roofing")).toEqual(["Roofing"]);
  });
});

describe("readProspectDemoMarker", () => {
  it("accepts only complete markers", () => {
    const marker = { kind: "prospect_demo", createdBy: "u1", createdAt: "2026-10-15T00:00:00Z", previewToken: "abcdefghijklmnop1234" };
    expect(readProspectDemoMarker(marker)).toEqual(marker);
    expect(readProspectDemoMarker({ ...marker, previewToken: "short" })).toBeNull();
    expect(readProspectDemoMarker({ ...marker, kind: "other" })).toBeNull();
    expect(readProspectDemoMarker(null)).toBeNull();
  });
});

import { factOrigin, websiteSuggestions } from "./jarvis-demo-site";
describe("Maps fact review provenance", () => {
  it("labels listing, edited, owner-entered and missing facts", () => {
    expect(factOrigin("Woods Auto Detail", "Woods Auto Detail")).toBe("listing");
    expect(factOrigin("Woods Auto Detail", "Woods Detailing")).toBe("edited");
    expect(factOrigin("", "owner@woods.com")).toBe("owner");
    expect(factOrigin("Graham", "  ")).toBe("missing");
  });
  it("website text is only a suggestion and junk is dropped", () => {
    expect(websiteSuggestions(null)).toEqual([]);
    expect(websiteSuggestions({ finalUrl: "https://a.com/", title: null, description: "Hi" })).toEqual([]);
    expect(websiteSuggestions({ finalUrl: "https://a.com/", title: null, description: "Mobile detailing for cars across Graham." })).toEqual([
      { field: "description", value: "Mobile detailing for cars across Graham.", source: "https://a.com/" },
    ]);
  });
});
