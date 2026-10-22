import { describe, expect, it } from "vitest";
import { missingRedesignSections } from "./site-plan-coverage";

const context = { pages: [
  { id: "home", sections: [{ id: "hero", components: [] }, { id: "process", components: [] }] },
  { id: "services", sections: [{ id: "offer", components: [] }] },
  { id: "faq", sections: [{ id: "questions", components: [] }] },
] };
const redesign = { scope: { breadth: "site", operation: "redesign" } };
describe("whole-site redesign coverage", () => {
  it("does not accept homepage-only composition as a whole website", () => {
    expect(missingRedesignSections(redesign, [{ type: "set_composition", sectionId: "hero" }], context)).toEqual(["process", "offer", "questions"]);
  });
  it("requires every section on every retained page", () => {
    expect(missingRedesignSections(redesign, ["hero", "process", "offer", "questions"].map(sectionId => ({ type: "set_composition", sectionId })), context)).toEqual([]);
  });
  it("does not force new layouts for a site-wide color edit", () => {
    expect(missingRedesignSections({ scope: { breadth: "site", operation: "edit" } }, [], context)).toEqual([]);
  });
  it("allows the AI to remove a section or page instead of redesigning it", () => {
    expect(missingRedesignSections(redesign, [{ type: "set_composition", sectionId: "hero" }, { type: "delete_section", sectionId: "process" }, { type: "delete_page", pageId: "services" }, { type: "set_composition", sectionId: "questions" }], context)).toEqual([]);
  });
});