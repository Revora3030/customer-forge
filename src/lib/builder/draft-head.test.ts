import { describe, expect, it } from "vitest";
import { draftHeadTitle } from "./draft-route";

describe("draftHeadTitle", () => {
  it("names the business (and page) in the draft tab title", () => {
    const data = { site: { org: { name: "Oak City  Plumbing" } } };
    expect(draftHeadTitle(data)).toBe("Oak City Plumbing — draft");
    expect(draftHeadTitle(data, "home")).toBe("Oak City Plumbing — draft");
    expect(draftHeadTitle(data, "drain-cleaning")).toBe("Drain Cleaning · Oak City Plumbing — draft");
  });
  it("falls back to the generic title while the draft is unknown", () => {
    expect(draftHeadTitle(null)).toBe("Website draft — Revora");
    expect(draftHeadTitle({ site: null }, "services")).toBe("Services — website page draft — Revora");
  });
});
