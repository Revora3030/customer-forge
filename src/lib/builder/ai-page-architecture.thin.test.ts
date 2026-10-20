import { describe, expect, it } from "vitest";
import { isThinFactSheet } from "@/lib/builder/ai-page-architecture.server";

describe("isThinFactSheet", () => {
  it("treats a one-line demo with no services as thin", () => {
    expect(isThinFactSheet({ services: [], description: "Auto detailing serving Durham, NC." })).toBe(true);
  });
  it("does not treat a business with services as thin", () => {
    expect(isThinFactSheet({ services: ["Interior detail"], description: null })).toBe(false);
  });
});
