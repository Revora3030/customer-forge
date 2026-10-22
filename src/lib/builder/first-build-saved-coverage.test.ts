import { describe, expect, it } from "vitest";
import { firstBuildCoverageProblems } from "./first-build-saved-coverage";

const pages = [{ id: "home", slug: "home" }, { id: "services", slug: "services" }];
const settings = { composition: { version: 1, root: { type: "stack", children: [{ type: "heading", text: "Real business", level: 1 }] } } };
const sections = pages.map(page => ({ id: `${page.id}-opening`, page_id: page.id, kind: "composition", settings }));
const expected = { pages: 2, sections: 2 };
describe("first customer website saved coverage", () => {
  it("accepts authored sections on every saved page", () => {
    expect(firstBuildCoverageProblems(pages, sections, expected)).toEqual([]);
  });
  it("rejects a homepage-only saved website", () => {
    expect(firstBuildCoverageProblems(pages.slice(0, 1), sections.slice(0, 1), expected)).toContain("Saved page inventory is incomplete");
  });
  it("rejects an empty supporting page", () => {
    expect(firstBuildCoverageProblems(pages, sections.slice(0, 1), expected)).toContain("Page services has no sections");
  });
  it("rejects a plain supporting section even when the homepage is designed", () => {
    expect(firstBuildCoverageProblems(pages, [sections[0], { ...sections[1], kind: "services", settings: {} }], expected)).toContain("Section services-opening has no renderable AI design");
  });
  it("rejects saved composition data that renders nothing", () => {
    expect(firstBuildCoverageProblems(pages, [sections[0], { ...sections[1], settings: { composition: { version: 1, root: { type: "unknown" } } } }], expected)).toContain("Section services-opening has no renderable AI design");
  });
  it("keeps only the two existing noncomposition mechanics exempt", () => {
    expect(firstBuildCoverageProblems(pages, [sections[0], { ...sections[1], kind: "embed", settings: {} }], expected)).toEqual([]);
    expect(firstBuildCoverageProblems(pages, [sections[0], { ...sections[1], kind: "contact", settings: {} }], expected)).toContain("Section services-opening has no renderable AI design");
  });
});