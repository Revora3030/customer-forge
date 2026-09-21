import { describe, expect, it } from "vitest";
import { formatLocality, formatRegion, formatServiceArea, localityLabel } from "./locality";

describe("locality formatting", () => {
  it("cleans loose city and state entry", () => {
    expect(formatLocality("New York ", "Ny")).toBe("New York, NY");
    expect(formatLocality("Raleigh ,", "nc")).toBe("Raleigh, NC");
  });

  it("keeps full region names as written", () => {
    expect(formatRegion(" North Carolina ")).toBe("North Carolina");
  });

  it("returns nothing when no location is supplied", () => {
    expect(formatLocality(null, null)).toBe("");
    expect(localityLabel({})).toBeNull();
  });

  it("works with city only", () => {
    expect(formatLocality("Durham", null)).toBe("Durham");
  });

  it("tidies a free-text service area", () => {
    expect(formatServiceArea("Raleigh , Durham ,Cary")).toBe("Raleigh, Durham, Cary");
  });

  it("prefers the service area over city and state", () => {
    expect(localityLabel({ serviceArea: "Triangle area", city: "Raleigh", state: "nc" })).toBe(
      "Triangle area",
    );
  });
});
