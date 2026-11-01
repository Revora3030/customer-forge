import { describe, expect, it } from "vitest";
import { siteStateMarker } from "./SiteStateMarker";

describe("siteStateMarker", () => {
  it("says Live only for a published site", () => {
    expect(siteStateMarker("published")).toEqual({ live: true, label: "Live" });
    for (const state of ["draft", "preview", "unpublished", "anything-else"]) {
      const marker = siteStateMarker(state);
      expect(marker?.live).toBe(false);
      expect(marker?.label).not.toMatch(/^live$/i);
    }
  });
  it("names a draft as a draft", () => {
    expect(siteStateMarker("draft")?.label).toMatch(/draft/i);
  });
  it("claims nothing until settings have loaded", () => {
    expect(siteStateMarker(null)).toBeNull();
    expect(siteStateMarker(undefined)).toBeNull();
  });
});
