import { describe, expect, it } from "vitest";
import { osmElementToProspect, overpassQuery } from "./osm-prospects";
import { parseProspectDemoInput } from "./jarvis-demo-site";
import { prospectDemoInput } from "./prospect-finder";

describe("OpenStreetMap prospects", () => {
  it("maps trades to OSM tags", () => {
    expect(overpassQuery("hvac contractor", [1, 2, 3, 4])).toContain('"craft"="hvac"');
  });
  it("reads name, email and website and marks no-website businesses", () => {
    const p = osmElementToProspect({ type: "node", id: 42, tags: { name: "Ace Plumbing", email: "Ace@Mail.com", phone: "555-0100" } }, "Dothan", "AL")!;
    expect(p).toMatchObject({ name: "Ace Plumbing", email: "ace@mail.com", presence: "none", city: "Dothan" });
  });
  it("skips unnamed elements", () => {
    expect(osmElementToProspect({ type: "node", id: 1, tags: {} }, "X", null)).toBeNull();
  });
  it("never passes an OSM id as a Google place ID", () => {
    const p = osmElementToProspect({ type: "way", id: 1234567, tags: { name: "Ace Roofing", craft: "roofer" } }, "Dothan", "AL")!;
    expect(parseProspectDemoInput(prospectDemoInput(p, "roofing")).placeId).toBeNull();
  });
});
