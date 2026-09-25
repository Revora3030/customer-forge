import { describe, expect, it } from "vitest";
import { dropUnchangedActions } from "./apply-plan";
import type { AgentAction } from "@/lib/site-agent";

const sections = new Map([
  ["s1", { heading: "Trusted roofing in Leeds", variant: "hero-split", is_visible: true }],
]);

describe("dropUnchangedActions", () => {
  it("drops a heading that already says exactly that", () => {
    const actions: AgentAction[] = [
      { type: "set_section_text", sectionId: "s1", field: "heading", value: "Trusted roofing in Leeds" },
    ];
    const result = dropUnchangedActions(actions, { sections });
    expect(result.actions).toHaveLength(0);
    expect(result.unchanged).toBe(1);
  });

  it("keeps a heading that is genuinely different", () => {
    const actions: AgentAction[] = [
      { type: "set_section_text", sectionId: "s1", field: "heading", value: "Roofing you can rely on" },
    ];
    expect(dropUnchangedActions(actions, { sections }).actions).toHaveLength(1);
  });

  it("drops visibility already in place", () => {
    const actions: AgentAction[] = [
      { type: "set_section_visibility", sectionId: "s1", visible: true },
    ];
    const result = dropUnchangedActions(actions, { sections });
    expect(result.unchanged).toBe(1);
    expect(result.actions).toHaveLength(0);
  });

  it("keeps everything it cannot compare", () => {
    const actions: AgentAction[] = [
      { type: "set_section_text", sectionId: "unknown", field: "heading", value: "x" },
      { type: "set_section_visibility", sectionId: "unknown", visible: false },
    ];
    expect(dropUnchangedActions(actions, { sections }).actions).toHaveLength(2);
  });

  it("drops direct styles already in place", () => {
    const styledSections = new Map([["s1", { settings: { style: { bgColor: "#112233" } } }]]);
    const components = new Map([["c1", { settings: { style: { buttonSize: "lg" } } }]]);
    const actions: AgentAction[] = [
      { type: "set_block_style", target: "section", targetId: "s1", device: "desktop", patch: { bgColor: "#112233" } },
      { type: "set_block_style", target: "component", targetId: "c1", device: "desktop", patch: { buttonSize: "lg" } },
    ];
    expect(dropUnchangedActions(actions, { sections: styledSections, components }).unchanged).toBe(2);
  });
});
