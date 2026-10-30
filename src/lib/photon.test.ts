import { describe, expect, it } from "vitest";
import { parsePhoton, photonUrl, PHOTON_DEBOUNCE_MS } from "./photon";

describe("photonUrl", () => {
  it("needs 3+ characters and caps results", () => {
    expect(photonUrl("12")).toBeNull();
    const url = new URL(photonUrl("  123  Main St ")!);
    expect(url.origin).toBe("https://photon.komoot.io");
    expect(url.pathname).toBe("/api/");
    expect(url.searchParams.get("q")).toBe("123 Main St");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("lat")).toBeTruthy();
  });

  it("debounces at least 300 ms (Photon fair use)", () => {
    expect(PHOTON_DEBOUNCE_MS).toBeGreaterThanOrEqual(300);
  });

  it("never points at Nominatim", () => {
    expect(photonUrl("Raleigh NC")).not.toContain("nominatim");
  });
});

describe("parsePhoton", () => {
  it("builds street/city/state/zip suggestions, US first, de-duplicated", () => {
    const list = parsePhoton({
      features: [
        { properties: { housenumber: "5", street: "Rue X", city: "Paris", postcode: "75001", countrycode: "FR" } },
        {
          properties: {
            housenumber: "123",
            street: "Main Street",
            city: "Raleigh",
            state: "North Carolina",
            postcode: "27601",
            countrycode: "US",
          },
        },
        {
          properties: {
            housenumber: "123",
            street: "Main Street",
            city: "Raleigh",
            state: "North Carolina",
            postcode: "27601",
            countrycode: "US",
          },
        },
        { properties: {} },
      ],
    });
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      street: "123 Main Street",
      city: "Raleigh",
      state: "North Carolina",
      postcode: "27601",
      countryCode: "US",
      label: "123 Main Street, Raleigh, North Carolina 27601",
    });
    expect(list[1]!.countryCode).toBe("FR");
  });

  it("is empty for junk", () => {
    expect(parsePhoton(null)).toEqual([]);
    expect(parsePhoton({ features: "x" })).toEqual([]);
  });
});
