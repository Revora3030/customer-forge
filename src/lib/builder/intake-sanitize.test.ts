import { describe, expect, it } from "vitest";
import { customerBusinessEmail, isPlatformEmail, isPlatformLabel, sanitizeServices } from "./intake-sanitize";
import { PLATFORM_OWNER_ORG_ID } from "@/lib/platform-owner";

describe("sanitizeServices", () => {
  it("drops platform UI wording that leaked into a customer's services", () => {
    const kept = sanitizeServices([
      { name: "All", price: 150 },
      { name: "Build my site", price: 0 },
      { name: "  build MY site! " },
      { name: "Driveway Cleaning", price: 120 },
    ]);
    expect(kept.map((s) => s.name)).toEqual(["Driveway Cleaning"]);
  });

  it("keeps real services that merely contain a UI word, and removes duplicates", () => {
    const kept = sanitizeServices([
      { name: "All-Season Roof Cleaning" },
      { name: "Gutter Submittal Review" },
      { name: "Roof Cleaning" },
      { name: "roof cleaning" },
      { name: "" },
    ]);
    expect(kept.map((s) => s.name)).toEqual(["All-Season Roof Cleaning", "Gutter Submittal Review", "Roof Cleaning"]);
  });

  it("treats non-strings and blanks as platform noise", () => {
    expect(isPlatformLabel(null)).toBe(true);
    expect(isPlatformLabel("   ")).toBe(true);
    expect(isPlatformLabel("House Soft Washing")).toBe(false);
  });
});

describe("customerBusinessEmail", () => {
  it("never lets a customer site show Revora's own inbox", () => {
    expect(isPlatformEmail("hello@revoragrowthsystems.com")).toBe(true);
    expect(isPlatformEmail("Support@Mail.RevoraGrowthSystems.com")).toBe(true);
    expect(customerBusinessEmail("hello@revoragrowthsystems.com", "11111111-1111-1111-1111-111111111111")).toBeNull();
  });

  it("allows Revora's address only on Revora's internal workspace", () => {
    expect(customerBusinessEmail("hello@revoragrowthsystems.com", PLATFORM_OWNER_ORG_ID)).toBe("hello@revoragrowthsystems.com");
  });

  it("keeps a real customer address and does not invent one", () => {
    expect(customerBusinessEmail(" jobs@elitepressure.com ", "org")).toBe("jobs@elitepressure.com");
    expect(customerBusinessEmail("", "org")).toBeNull();
    expect(customerBusinessEmail(undefined, "org")).toBeNull();
    expect(isPlatformEmail("owner@notrevoragrowthsystems.com")).toBe(false);
  });
});
