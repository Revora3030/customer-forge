import { describe, expect, it } from "vitest";
import { applyEditScope } from "@/lib/builder/edit-scope";
import { securityCheck } from "@/lib/preflight-security";
import {
  buildFixAllRequest,
  buildFixRequest,
  fixScopeToEditScope,
  isAiFixable,
  parseFixScope,
  splitFixAll,
  type FixFinding,
} from "./fix-it";

const services: FixFinding = {
  title: "A form sends details to another website",
  plainReason: "The Services page form posts elsewhere.",
  scope: "page:services",
};
const owner: FixFinding = {
  title: "A secret key is visible",
  plainReason: "Only you can rotate it.",
  scope: "site",
  needsOwner: true,
};

describe("fix-it", () => {
  it("parses scopes, defaulting unknown ones to site", () => {
    expect(parseFixScope("page:services")).toEqual({ kind: "page", slug: "services" });
    expect(parseFixScope("site")).toEqual({ kind: "site" });
    expect(parseFixScope("page:")).toEqual({ kind: "site" });
  });

  it("builds a scoped, draft-only request", () => {
    const text = buildFixRequest(services);
    expect(text).toContain('Only change the "services" page');
    expect(text).toContain("Do not publish");
    expect(text).toContain(services.plainReason);
  });

  it("Fix all batches only findings the AI may change", () => {
    const { fixable, needsOwner } = splitFixAll([services, owner]);
    expect(fixable).toEqual([services]);
    expect(needsOwner).toEqual([owner]);
    expect(isAiFixable(owner)).toBe(false);
    expect(buildFixAllRequest(fixable)).not.toContain(owner.title);
  });

  it("a page:services finding cannot change another page", () => {
    const pages = [
      { id: "p-services", slug: "services", sections: [{ id: "s1", components: [{ id: "c1" }] }] },
      { id: "p-contact", slug: "contact", sections: [{ id: "s2", components: [{ id: "c2" }] }] },
    ];
    const scope = fixScopeToEditScope("page:services", pages);
    expect(scope).toEqual({ pageIds: ["p-services"] });
    const actions = [
      { type: "set_section_text", sectionId: "s1", field: "heading", value: "A" },
      { type: "set_section_text", sectionId: "s2", field: "heading", value: "B" },
    ];
    const result = applyEditScope(actions, { pages }, scope!);
    expect(result.actions).toEqual([actions[0]]);
    expect(fixScopeToEditScope("site", pages)).toBeNull();
    expect(fixScopeToEditScope("page:missing", pages)).toBeNull();
  });

  it("works on real security-check items: no findings, no cards", () => {
    expect(securityCheck([]).items).toHaveLength(0);
  });
});
