import { describe, expect, it } from "vitest";
import { DESIGN_DIRECTIONS, recommendDirections } from "./design-directions";
import { SITE_HEADING_FONTS, siteFontHref, siteFontStyle, siteHeadingFont } from "./site-theme";
import { contrastRatio } from "./builder/site-design-system";
import { pickVisualDirection } from "./visual-direction";

describe("the design library", () => {
  it("offers a large, varied set of complete looks", () => {
    expect(DESIGN_DIRECTIONS.length).toBeGreaterThanOrEqual(55);
    expect(new Set(DESIGN_DIRECTIONS.map((d) => d.id)).size).toBe(DESIGN_DIRECTIONS.length);
    // Real variety, not one palette with different words.
    expect(new Set(DESIGN_DIRECTIONS.map((d) => d.primary)).size).toBeGreaterThan(40);
    expect(new Set(DESIGN_DIRECTIONS.map((d) => d.backdrop)).size).toBeGreaterThan(4);
    expect(new Set(DESIGN_DIRECTIONS.map((d) => d.font)).size).toBeGreaterThan(20);
  });

  it("only uses heading fonts a published site can actually load", () => {
    for (const direction of DESIGN_DIRECTIONS) {
      expect(SITE_HEADING_FONTS[direction.font], direction.id).toBeTruthy();
    }
  });

  it("keeps headline text readable against its own background", () => {
    for (const direction of DESIGN_DIRECTIONS) {
      expect(contrastRatio(direction.primary, direction.secondary), direction.id).toBeGreaterThan(
        2.2,
      );
    }
  });

  it("gives two businesses in the same trade different top choices", () => {
    const one = recommendDirections({
      businessName: "Northgate Plumbing",
      industry: "plumbing",
      services: [{ name: "Boiler repair" }],
      city: "Leeds",
      count: 4,
    });
    const two = recommendDirections({
      businessName: "Riverside Plumbers",
      industry: "plumbing",
      services: [{ name: "Boiler repair" }],
      city: "Leeds",
      count: 4,
    });
    expect(one[0]!.id).not.toBe(two[0]!.id);
  });

  it("prioritizes premium dark art direction for automotive detailing", () => {
    const [direction] = recommendDirections({
      businessName: "Northline Auto Studio",
      industry: "Automotive detailing",
      services: [{ name: "Ceramic coating" }, { name: "Interior detail" }],
      city: "New York",
      count: 1,
    });
    expect(direction?.id).toBe("luxury-gold");
  });

  it("selects dedicated picture languages for specialist local services", () => {
    expect(pickVisualDirection({ industry: "pet grooming" }).id).toBe("pet-care");
    expect(pickVisualDirection({ industry: "locksmith" }).id).toBe("secure-trade");
    expect(pickVisualDirection({ industry: "junk removal" }).id).toBe("moving-logistics");
    expect(pickVisualDirection({ industry: "solar installer" }).id).toBe("technology");
  });
});

describe("heading fonts on a published site", () => {
  it("requests and applies an allowlisted font", () => {
    expect(siteHeadingFont("playfair display")).toBe("Playfair Display");
    expect(siteFontHref("Playfair Display")).toContain("Playfair+Display");
    expect(siteFontStyle("Playfair Display")).toMatchObject({
      "--font-heading": expect.stringContaining("Playfair Display"),
    });
  });

  it("ignores anything not on the allowlist", () => {
    expect(siteHeadingFont("Comic Sans; url(evil)")).toBeNull();
    expect(siteFontHref("")).toBeNull();
    expect(siteFontStyle(null)).toBeUndefined();
  });
});
