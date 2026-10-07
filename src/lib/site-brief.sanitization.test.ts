import { describe, expect, it } from "vitest";
import {
  sanitizeCustomerContactEmail,
  sanitizeServiceRows,
} from "@/lib/site-brief.server";

describe("customer intake sanitization", () => {
  it("removes platform UI tokens and deduplicates services", () => {
    const rows = sanitizeServiceRows(
      [
        { name: "Build my site" },
        { name: "All" },
        { name: "Driveway Cleaning" },
        { name: "driveway cleaning" },
        { name: "Roof Cleaning", starting_price: 299 },
        { name: "Submit" },
      ],
      "Pressure Washing",
    );
    expect(rows).toEqual([
      { name: "Driveway Cleaning" },
      { name: "Roof Cleaning", starting_price: 299 },
    ]);
  });

  it("supplies grounded industry services when the customer provides none", () => {
    expect(sanitizeServiceRows([], "Pressure Washing").map((row) => row.name)).toEqual([
      "Driveway Cleaning",
      "House Soft Washing",
      "Roof Cleaning",
      "Deck Restoration",
    ]);
  });

  it("rejects Revora platform email addresses for customer workspaces", () => {
    expect(sanitizeCustomerContactEmail("hello@revoragrowthsystems.com", {
      orgName: "Jordan Pressure Washing",
      orgSlug: "jordan-pressure-washing",
    })).toBeNull();
    expect(sanitizeCustomerContactEmail("owner@example.com", {
      orgName: "Jordan Pressure Washing",
      orgSlug: "jordan-pressure-washing",
    })).toBe("owner@example.com");
  });

  it("allows Revora's own internal workspace email", () => {
    expect(sanitizeCustomerContactEmail("hello@revoragrowthsystems.com", {
      orgName: "Revora Growth Systems",
      orgSlug: "revora",
    })).toBe("hello@revoragrowthsystems.com");
  });
});
