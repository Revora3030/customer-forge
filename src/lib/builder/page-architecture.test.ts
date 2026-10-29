import { describe, expect, it } from "vitest";
import { pageArchitecture } from "./page-architecture";
describe("stable section architecture", () => {
  const sections = [{ id: "hero", kind: "hero", heading: "Welcome", subheading: null }, { id: "services", kind: "services", heading: "Services", subheading: null }];
  it("keeps order and immediate neighbors without borrowing their material", () => {
    expect(pageArchitecture(sections, "services", "home")).toMatchObject({ index: 1, total: 2, previous: { role: "hero", heading: "Welcome" }, next: null });
  });
  it("is stable under regenerated row IDs but changes when neighboring direction changes", () => {
    const first = pageArchitecture(sections, "services", "home");
    expect(pageArchitecture(sections.map((section) => ({ ...section, id: `new-${section.id}` })), "new-services", "home")).toEqual(first);
    expect(pageArchitecture([{ ...sections[0], heading: "Changed story" }, sections[1]], "services", "home")).not.toEqual(first);
  });
});