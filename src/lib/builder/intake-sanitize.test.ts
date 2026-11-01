import { describe, expect, it } from "vitest";
import { checkServiceName, partitionServiceNames, validateIntakeServices, customerBusinessEmail, isPlatformEmail, isPlatformLabel, mergeSplitServices, sanitizeServices } from "./intake-sanitize";
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

describe("mergeSplitServices", () => {
  it("joins a lone qualifier with the following service name", () => {
    const merged = mergeSplitServices([
      { name: "Full", price: 350 },
      { name: "Auto detailing" },
      { name: "Ceramic coating", price: 200, description: "Paint protection" },
    ]);
    expect(merged.map((row) => row.name)).toEqual(["Full Auto detailing", "Ceramic coating"]);
    expect(merged[0]?.price).toBe(350);
  });
  it("joins a priced qualifier to a longer following name", () => {
    const merged = mergeSplitServices([
      { name: "Full", price: 250 },
      { name: "Auto detailing", price: 250 },
    ]);
    expect(merged.map((row) => row.name)).toEqual(["Full Auto detailing"]);
    expect(merged[0]?.price).toBe(250);
  });
  it("leaves two priced packages separate", () => {
    expect(mergeSplitServices([{ name: "Full", price: 100 }, { name: "Interior", price: 80 }]).map((row) => row.name)).toEqual(["Full", "Interior"]);
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

describe("service name validation at intake", () => {
  it("rejects the one-word stub 'Full' and asks for the full name", () => {
    const check = checkServiceName("Full");
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.reason).toBe("vague");
      expect(check.message).toMatch(/full name/i);
    }
  });

  it("rejects other qualifiers, filler, platform wording, and names with no real letters", () => {
    for (const name of ["", "  ", "Basic", "premium", "Stuff", "Package", "Build my site", "A", "12", "TBD"]) {
      expect(checkServiceName(name).ok, name).toBe(false);
    }
  });

  it("accepts full names and real one-word trades without changing them", () => {
    expect(checkServiceName("Full auto detailing")).toEqual({ ok: true, name: "Full auto detailing" });
    expect(checkServiceName("  Driveway   Cleaning ")).toEqual({ ok: true, name: "Driveway Cleaning" });
    expect(checkServiceName("Plumbing").ok).toBe(true);
    expect(checkServiceName("Landscaping").ok).toBe(true);
  });

  it("ignores untouched empty rows but reports stubs", () => {
    const { valid, rejected } = partitionServiceNames([{ name: "" }, { name: "Full" }, { name: "Gutter cleaning" }]);
    expect(valid.map((s) => s.name)).toEqual(["Gutter cleaning"]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.name).toBe("Full");
  });

  it("joins a split phrase first, so 'Full' + 'Auto detailing' is accepted as one service", () => {
    const { valid, rejected } = validateIntakeServices([{ name: "Full" }, { name: "Auto detailing" }]);
    expect(rejected).toEqual([]);
    expect(valid.map((s) => s.name)).toEqual(["Full Auto detailing"]);
  });

  it("rejects a trailing stub and never invents a price", () => {
    const { valid, rejected } = validateIntakeServices([{ name: "Pressure washing" }, { name: "Full" }]);
    expect(rejected.map((r) => r.name)).toEqual(["Full"]);
    expect(valid).toEqual([{ name: "Pressure washing" }]);
    expect(valid.every((row) => !("price" in row))).toBe(true);
  });
});
