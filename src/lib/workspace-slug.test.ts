import { describe, expect, it } from "vitest";
import { isValidWorkspaceSlug } from "./workspace-slug";

describe("isValidWorkspaceSlug", () => {
  it("accepts lowercase words joined by single hyphens", () => {
    expect(isValidWorkspaceSlug("smith-plumbing")).toBe(true);
    expect(isValidWorkspaceSlug("abc123")).toBe(true);
  });
  it("rejects spaces, capitals, empty and stray hyphens", () => {
    for (const bad of ["", "Smith", "a b", "-a", "a-", "a--b", "a_b", "a/b"]) {
      expect(isValidWorkspaceSlug(bad)).toBe(false);
    }
  });
});
