import { describe, expect, it } from "vitest";
import {
  canonicalMapsLink,
  looksLikeMapsLink,
  mapsEmbedFromSavedLink,
  mapsEmbedUrl,
  mapsLinkFromResolved,
  parseMapsLink,
  splitPlaceText,
} from "./maps-link";

const PLACE =
  "https://www.google.com/maps/place/Elite+Mobile+Detailing/@35.7796,-78.6382,17z/data=!3m1!4b1!4m6!3m5!1s0x89acf5:0xabc!8m2!3d35.779712!4d-78.638233!16s%2Fg%2F11abc";

describe("parseMapsLink", () => {
  it("reads name and map pin from a full place link, preferring the place pin over the view centre", () => {
    const parsed = parseMapsLink(PLACE);
    expect(parsed).toEqual({
      ok: true,
      kind: "place",
      fields: { name: "Elite Mobile Detailing", city: "", state: "", lat: 35.779712, lng: -78.638233 },
    });
  });

  it("falls back to the @lat,lng view centre when there is no place pin", () => {
    const parsed = parseMapsLink("https://www.google.com/maps/place/Joe's+Plumbing+%26+Drain/@35.7796,-78.6382,17z");
    expect(parsed).toMatchObject({ ok: true, kind: "place", fields: { name: "Joe's Plumbing & Drain", lat: 35.7796, lng: -78.6382 } });
  });

  it("splits a city and state only when the link text contains them", () => {
    const parsed = parseMapsLink("https://www.google.com/maps/place/Triangle+Comfort+HVAC,+Raleigh,+NC+27601/@35.78,-78.64,15z");
    expect(parsed).toMatchObject({ ok: true, fields: { name: "Triangle Comfort HVAC", city: "Raleigh", state: "NC" } });
  });

  it("reads a search link and the ?q= / ?query= forms", () => {
    expect(parseMapsLink("https://www.google.com/maps/search/mobile+detailing+raleigh")).toMatchObject({
      ok: true,
      fields: { name: "mobile detailing raleigh", lat: null, lng: null },
    });
    expect(parseMapsLink("https://maps.google.com/?q=Triangle+Comfort+HVAC")).toMatchObject({ ok: true, fields: { name: "Triangle Comfort HVAC" } });
    expect(parseMapsLink("https://www.google.com/maps/search/?api=1&query=Woods+Auto+Repair")).toMatchObject({ ok: true, fields: { name: "Woods Auto Repair" } });
  });

  it("accepts other Google country domains and a link without https://", () => {
    expect(parseMapsLink("https://www.google.co.uk/maps/place/Bath+Plumbers/@51.38,-2.36,15z")).toMatchObject({ ok: true, fields: { name: "Bath Plumbers" } });
    expect(parseMapsLink("google.com/maps/place/Bath+Plumbers/@51.38,-2.36,15z")).toMatchObject({ ok: true, fields: { name: "Bath Plumbers" } });
  });

  it("hands share short links back for the server to follow", () => {
    expect(parseMapsLink("https://maps.app.goo.gl/AbC123xyz")).toEqual({ ok: true, kind: "short_link", url: "https://maps.app.goo.gl/AbC123xyz" });
    expect(parseMapsLink("https://g.co/kgs/AbC123")).toEqual({ ok: true, kind: "short_link", url: "https://g.co/kgs/AbC123" });
    expect(parseMapsLink("https://goo.gl/maps/AbC123")).toMatchObject({ ok: true, kind: "short_link" });
  });

  it("refuses bad input with a plain message", () => {
    for (const bad of [
      "",
      "   ",
      "Joe's Plumbing Raleigh",
      "https://example.com/maps/place/Joe",
      "https://www.google.com/search?q=joe",
      "https://goo.gl/somethingelse",
      "javascript:alert(1)",
      "https://evil.test/?u=https://www.google.com/maps/place/Joe",
      "https://www.google.com/maps/@35.7796,-78.6382,15z",
      "https://www.google.com/maps/place/@35.7796,-78.6382,15z",
      `https://www.google.com/maps/place/${"a".repeat(2100)}`,
    ]) {
      const parsed = parseMapsLink(bad);
      expect(parsed.ok, bad.slice(0, 60)).toBe(false);
      if (!parsed.ok) expect(parsed.message.length).toBeGreaterThan(5);
    }
  });

  it("ignores out-of-range coordinates", () => {
    const parsed = parseMapsLink("https://www.google.com/maps/place/Odd+Spot/@135.7796,-278.6382,17z");
    expect(parsed).toMatchObject({ ok: true, fields: { name: "Odd Spot", lat: null, lng: null } });
  });
});

describe("looksLikeMapsLink", () => {
  it("separates Maps links from websites", () => {
    expect(looksLikeMapsLink("https://maps.app.goo.gl/x")).toBe(true);
    expect(looksLikeMapsLink("https://www.google.com/maps/place/Joe")).toBe(true);
    expect(looksLikeMapsLink("maps.google.com/?q=joe")).toBe(true);
    expect(looksLikeMapsLink("https://g.co/kgs/x")).toBe(true);
    expect(looksLikeMapsLink("yourbusiness.com")).toBe(false);
    expect(looksLikeMapsLink("https://www.google.com/search?q=joe")).toBe(false);
    expect(looksLikeMapsLink("https://goo.gl/other")).toBe(false);
    expect(looksLikeMapsLink("not a link")).toBe(false);
  });
});

describe("splitPlaceText", () => {
  it("never guesses a city for a plain name", () => {
    expect(splitPlaceText("Joe's Plumbing")).toEqual({ name: "Joe's Plumbing", city: "", state: "" });
  });
  it("skips a street address when looking for the city", () => {
    expect(splitPlaceText("Joe's Plumbing, 12 Main St, Raleigh, NC 27601")).toEqual({ name: "Joe's Plumbing", city: "Raleigh", state: "NC" });
    expect(splitPlaceText("Joe's Plumbing, 12 Main St")).toEqual({ name: "Joe's Plumbing", city: "", state: "" });
    expect(splitPlaceText("Joe's Plumbing, Raleigh")).toEqual({ name: "Joe's Plumbing", city: "Raleigh", state: "" });
  });
});

describe("map frame and saved link", () => {
  it("builds the key-less Google embed from name and pin", () => {
    const url = mapsEmbedUrl({ name: "Elite Mobile Detailing", city: "", lat: 35.779712, lng: -78.638233 });
    expect(url).toBe(`https://www.google.com/maps?q=${encodeURIComponent("Elite Mobile Detailing@35.779712,-78.638233")}&output=embed`);
    expect(url).not.toMatch(/key=/);
  });

  it("falls back to name and city when there is no pin, and to nothing without a name", () => {
    expect(mapsEmbedUrl({ name: "Joe", city: "Raleigh", lat: null, lng: null })).toBe(
      `https://www.google.com/maps?q=${encodeURIComponent("Joe, Raleigh")}&output=embed`,
    );
    expect(mapsEmbedUrl({ name: " ", city: "", lat: 1, lng: 2 })).toBeNull();
  });

  it("saves a short link that parses back to the same place", () => {
    const fields = { name: "Joe's Plumbing & Drain", city: "Raleigh", state: "NC", lat: 35.7796, lng: -78.6382 };
    const link = canonicalMapsLink(fields)!;
    expect(link.length).toBeLessThan(200);
    const parsed = parseMapsLink(link);
    expect(parsed).toMatchObject({ ok: true, kind: "place", fields });
  });

  it("shows a map only for a readable full Maps link", () => {
    expect(mapsEmbedFromSavedLink(PLACE)?.url).toContain("output=embed");
    expect(mapsEmbedFromSavedLink("https://www.facebook.com/joesplumbing")).toBeNull();
    expect(mapsEmbedFromSavedLink("https://maps.app.goo.gl/AbC123")).toBeNull();
    expect(mapsEmbedFromSavedLink("http://www.google.com/maps/place/Joe")).toBeNull();
    expect(mapsEmbedFromSavedLink(null)).toBeNull();
    expect(mapsEmbedFromSavedLink("")).toBeNull();
  });

  it("turns the search page a g.co/kgs link lands on into a Maps search, and leaves other links alone", () => {
    expect(mapsLinkFromResolved("https://www.google.com/search?q=Joe%27s+Plumbing+Raleigh&kgmid=/g/11x")).toBe(
      "https://www.google.com/maps/search/Joe's%20Plumbing%20Raleigh",
    );
    expect(mapsLinkFromResolved("https://www.google.com/maps/place/Joe")).toBe("https://www.google.com/maps/place/Joe");
    expect(mapsLinkFromResolved("not a url")).toBe("not a url");
  });
});
