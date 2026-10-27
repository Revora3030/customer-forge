import { describe, expect, it } from "vitest";
import { firstBuildCoverageProblems, missingPictureProblems } from "./first-build-saved-coverage";

const pages = [{ id: "home", slug: "home" }, { id: "services", slug: "services" }];
const settings = { composition: { version: 1, root: { type: "stack", children: [{ type: "heading", text: "Real business", level: 1 }] } } };
const sections = [
  { id: "home-opening", page_id: "home", kind: "composition", settings },
  { id: "services-opening", page_id: "services", kind: "composition", settings },
] as const;
const expected = { pages: 2, sections: 2 };
describe("first customer website saved coverage", () => {
  it("accepts authored sections on every saved page", () => {
    expect(firstBuildCoverageProblems(pages, sections, expected)).toEqual([]);
  });
  const inventory = {
    pages: [...pages],
    sections: sections.map(section => ({ id: section.id, page_id: section.page_id, role: "hero" })),
  };
  const authored = sections.map(section => ({ ...section, settings: { ...settings, role: "hero" } }));
  const exact = { ...expected, inventory };
  it("accepts the exact saved inventory in any readback order", () => {
    expect(firstBuildCoverageProblems([...pages].reverse(), [...authored].reverse(), exact)).toEqual([]);
  });
  it("rejects substituted pages with the same total count", () => {
    expect(firstBuildCoverageProblems([pages[0], { ...pages[1], slug: "wrong-page" }], authored, exact)).toContain("Saved pages do not match the accepted build inventory");
  });
  it("rejects substituted section identities with the same total count", () => {
    expect(firstBuildCoverageProblems(pages, [authored[0], { ...authored[1], id: "wrong-section" }], exact)).toContain("Saved sections do not match the accepted build inventory");
  });
  it("rejects a section moved to another page", () => {
    expect(firstBuildCoverageProblems(pages, [authored[0], { ...authored[1], page_id: "home" }], exact)).toContain("Saved sections do not match the accepted build inventory");
  });
  it("rejects a lost conversion role even when the composition renders", () => {
    expect(firstBuildCoverageProblems(pages, [authored[0], { ...authored[1], settings }], exact)).toContain("Saved sections do not match the accepted build inventory");
  });
  it("rejects duplicate page and section identities", () => {
    const problems = firstBuildCoverageProblems([pages[0], pages[0]], [authored[0], authored[0]], exact);
    expect(problems).toContain("Saved page inventory contains duplicate identities");
    expect(problems).toContain("Saved section inventory contains duplicate identities");
    expect(problems).toContain("Saved sections do not match the accepted build inventory");
  });
  it("does not let duplicate sections satisfy required multiplicity", () => {
    const withRepeatedRoles = { ...exact, inventory: { ...inventory, sections: [...inventory.sections, { id: "services-closing", page_id: "services", role: "hero" }] } };
    expect(firstBuildCoverageProblems(pages, [...authored, authored[1]], withRepeatedRoles)).toContain("Saved sections do not match the accepted build inventory");
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
  it("rejects a design that shows a picture never saved to the website", () => {
    const pic = { composition: { version: 1, root: { type: "image", mediaRef: "temp_hero", alt: "x" } } };
    const withPic = [{ id: "hero", page_id: "home", kind: "composition", settings: pic }];
    expect(missingPictureProblems(withPic, new Set())).toEqual(["Section hero shows a picture that was never saved"]);
    expect(missingPictureProblems(withPic, new Set(["temp_hero"]))).toEqual([]);
  });
});