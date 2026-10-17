import { describe, expect, it } from "vitest";
import { mapsLookupFrom, mapsRedirectTarget, parseImageFacts } from "./prospect-source";

describe("mapsLookupFrom", () => {
  it("reads the business and map center from a place link", () => {
    expect(
      mapsLookupFrom("https://www.google.com/maps/place/Joe's+Plumbing+%26+Drain/@35.7796,-78.6382,17z/data=!3m1!4b1"),
    ).toEqual({ kind: "query", query: "Joe's Plumbing & Drain", lat: 35.7796, lng: -78.6382 });
  });

  it("reads search links and ?q= links", () => {
    expect(mapsLookupFrom("https://www.google.com/maps/search/mobile+detailing+raleigh")).toMatchObject({ query: "mobile detailing raleigh" });
    expect(mapsLookupFrom("https://maps.google.com/?q=Triangle+Comfort+HVAC")).toMatchObject({ query: "Triangle Comfort HVAC" });
  });

  it("passes share short links to the server to resolve", () => {
    expect(mapsLookupFrom("https://maps.app.goo.gl/AbC123xyz")).toEqual({ kind: "short_link", url: "https://maps.app.goo.gl/AbC123xyz" });
  });

  it("accepts plain name and city text", () => {
    expect(mapsLookupFrom("  Joe's Plumbing   Raleigh NC ")).toEqual({ kind: "query", query: "Joe's Plumbing Raleigh NC", lat: null, lng: null });
  });

  it("refuses links that aren't Google Maps or can't be searched", () => {
    expect(() => mapsLookupFrom("https://evil.example/maps/place/x")).toThrow(/isn't a Google Maps link/);
    expect(() => mapsLookupFrom("https://google.com.evil.example/maps/place/x")).toThrow(/isn't a Google Maps link/);
    expect(() => mapsLookupFrom("https://goo.gl/abc")).toThrow(/isn't a Google Maps link/);
    expect(() => mapsLookupFrom("https://www.google.com/maps?q=35.1,-78.2")).toThrow(/Share/);
    expect(() => mapsLookupFrom("")).toThrow();
  });
});

describe("mapsRedirectTarget", () => {
  it("follows only https Google Maps redirects", () => {
    expect(mapsRedirectTarget("https://www.google.com/maps/place/X", "https://maps.app.goo.gl/a")).toBe("https://www.google.com/maps/place/X");
    expect(mapsRedirectTarget("http://www.google.com/maps/place/X", "https://maps.app.goo.gl/a")).toBeNull();
    expect(mapsRedirectTarget("https://169.254.169.254/latest", "https://maps.app.goo.gl/a")).toBeNull();
    expect(
      mapsRedirectTarget(
        "https://consent.google.com/m?continue=https%3A%2F%2Fwww.google.com%2Fmaps%2Fplace%2FY",
        "https://maps.app.goo.gl/a",
      ),
    ).toBe("https://www.google.com/maps/place/Y");
    expect(mapsRedirectTarget(null, "https://maps.app.goo.gl/a")).toBeNull();
  });
});

describe("parseImageFacts", () => {
  it("keeps clean visible facts", () => {
    const facts = parseImageFacts(
      'Here you go: {"businessName":"Shine Mobile Detailing","industry":"Mobile detailing","city":"Raleigh","state":"NC","phone":"(919) 555-0188","email":"Book@Shine.example","website":"shine.example","services":["Interior detail","Ceramic coating","interior detail","ok"],"description":"We come to you."}',
    );
    expect(facts).toEqual({
      businessName: "Shine Mobile Detailing",
      industry: "Mobile detailing",
      city: "Raleigh",
      state: "NC",
      phone: "(919) 555-0188",
      email: "book@shine.example",
      website: "shine.example",
      services: ["Interior detail", "Ceramic coating"],
      description: "We come to you.",
    });
  });

  it("drops malformed values and markup instead of guessing", () => {
    const facts = parseImageFacts('{"businessName":"<b>Ace</b>","phone":"555","email":"nope","website":"javascript:alert(1)","services":"x"}');
    expect(facts.businessName).toBe("bAce/b");
    expect(facts.phone).toBe("");
    expect(facts.email).toBe("");
    expect(facts.website).toBe("");
    expect(facts.services).toEqual([]);
  });

  it("returns empty facts for non-JSON answers", () => {
    expect(parseImageFacts("I can't read this image.").businessName).toBe("");
    expect(parseImageFacts("{not json}").city).toBe("");
  });
});

describe("Jarvis prospect.lookup action", () => {
  it("accepts a Maps link or name and city, and rejects empty input", async () => {
    const { parseActions } = await import("./jarvis-actions");
    expect(parseActions([{ id: "prospect.lookup", args: { input: "https://maps.app.goo.gl/AbC" } }], []).reads).toEqual([
      { id: "prospect.lookup", input: "https://maps.app.goo.gl/AbC" },
    ]);
    expect(parseActions([{ id: "prospect.lookup", args: {} }], []).rejected[0]).toMatch(/Google Maps link/);
  });
});
