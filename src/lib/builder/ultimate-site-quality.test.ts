import { describe, expect, it } from "vitest";
import { compileUltimateSiteQuality } from "./ultimate-site-quality";

const context = {
  business: { name: "Northstar Roofing", industry: "roofing", city: "Raleigh", phone: "555-555-5555", email: "hello@example.com", services: [{ name: "Roof repair" }] },
  pages: [{ id: "home", title: "Home", slug: "", is_visible: true, sections: [
    { id: "hero", kind: "hero", is_visible: true, components: [{ id: "img", kind: "image", label: "Roof replacement" }] },
    { id: "services", kind: "services", is_visible: true, components: [] },
    { id: "cta", kind: "cta", is_visible: true, components: [] },
  ] }],
} as never;

describe("ultimate site quality", () => {
  it("compiles a coordinated multi-domain plan", () => {
    const result = compileUltimateSiteQuality(context, "build a premium website", 40);
    expect(result.actions.length).toBeGreaterThan(10);
    expect(result.directionId).toBeTruthy();
    expect(result.domains.designSystem).toBe(99);
    expect(result.score).toBeGreaterThan(90);
  });
  it("respects the action budget", () => {
    expect(compileUltimateSiteQuality(context, "make it excellent", 5).actions.length).toBeLessThanOrEqual(5);
  });
});
