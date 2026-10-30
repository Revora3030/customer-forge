import { describe, expect, it } from "vitest";
import { addressAddsDetail, serviceAreaPhrase } from "./site-sections-utils";
import { businessFacts } from "@/lib/builder/facts";
import { localBusinessSchema } from "@/lib/site-head";

describe("service area and address rows (2026-10-30 Oak City audit)", () => {
  it("reads a raw radius field the way a person says it", () => {
    expect(serviceAreaPhrase("Raleigh, NC + 25 Miles")).toBe("Raleigh, NC and up to 25 miles around");
    expect(serviceAreaPhrase("Leeds plus 10km")).toBe("Leeds and up to 10 km around");
    expect(serviceAreaPhrase("Wake County")).toBe("Wake County");
    expect(serviceAreaPhrase("  ")).toBeNull();
  });

  it("drops a city-only address the service area already names, keeps a street address", () => {
    expect(addressAddsDetail("Raleigh, NC", "Raleigh, NC and up to 25 miles around")).toBe(false);
    expect(addressAddsDetail("12 Main St, Raleigh, NC", "Raleigh, NC and up to 25 miles around")).toBe(true);
    expect(addressAddsDetail("Raleigh, NC 27601", "Raleigh, NC and up to 25 miles around")).toBe(false);
    expect(addressAddsDetail("Durham, NC", "Raleigh, NC")).toBe(true);
    expect(addressAddsDetail(null, "Raleigh, NC")).toBe(false);
  });

  it("hands the AI and every widget the readable phrase, not the raw field", () => {
    const facts = businessFacts({ service_area: "raleigh, nc + 25 miles" }, "Oak City Plumbing");
    expect(facts.serviceArea).toBe("Raleigh, NC and up to 25 miles around");
  });
});

describe("LocalBusiness areaServed", () => {
  it("names the place, not the radius", () => {
    const schema = localBusinessSchema({ name: "Oak City Plumbing", url: "https://example.org", profile: { service_area: "Raleigh, NC + 25 Miles" } });
    expect(schema["areaServed"]).toBe("Raleigh, NC");
    const plain = localBusinessSchema({ name: "X", url: "https://example.org", profile: { service_area: "Wake County" } });
    expect(plain["areaServed"]).toBe("Wake County");
  });
});
