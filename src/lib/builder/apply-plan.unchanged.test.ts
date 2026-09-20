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
    const result = dropUnchangedActions(actions, sections);
    expect(result.actions).toHaveLength(0);
    expect(result.unchanged).toBe(1);
  });

  it("keeps a heading that is genuinely different", () => {
    const actions: AgentAction[] = [
      { type: "set_section_text", sectionId: "s1", field: "heading", value: "Roofing you can rely on" },
    ];
    expect(dropUnchangedActions(actions, sections).actions).toHaveLength(1);
  });

  it("drops a variant and visibility already in place", () => {
    const actions: AgentAction[] = [
      { type: "set_section_variant", sectionId: "s1", variant: "hero-split" },
      { type: "set_section_visibility", sectionId: "s1", visible: true },
      { type: "set_section_variant", sectionId: "s1", variant: "hero-layered" },
    ];
    const result = dropUnchangedActions(actions, sections);
    expect(result.unchanged).toBe(2);
    expect(result.actions).toHaveLength(1);
  });

  it("keeps everything it cannot compare", () => {
    const actions: AgentAction[] = [
      { type: "set_section_text", sectionId: "unknown", field: "heading", value: "x" },
      { type: "set_section_effect", sectionId: "s1", effect: "aurora" } as AgentAction,
    ];
    expect(dropUnchangedActions(actions, sections).actions).toHaveLength(2);
  });
});
