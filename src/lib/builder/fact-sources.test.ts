import { describe, expect, it } from "vitest";
import { buildFactSources, missingFactCount } from "./fact-sources";

const base = { businessName: "Harbor Line", services: ["Drains"], city: "Mobile", serviceArea: null, email: "a@b.co", phone: null };

describe("fact sources", () => {
  it("marks owner-entered facts as owner", () => {
    expect(buildFactSources(base).every((r) => r.source === "owner")).toBe(true);
  });
  it("flags missing facts instead of filling them", () => {
    const rows = buildFactSources({ ...base, email: " ", phone: null, services: [] });
    expect(missingFactCount(rows)).toBe(2);
    expect(rows.find((r) => r.key === "contact")?.value).toBeNull();
  });
  it("falls back from service area to city", () => {
    expect(buildFactSources(base).find((r) => r.key === "area")?.value).toBe("Mobile");
  });
});
