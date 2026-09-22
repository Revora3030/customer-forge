import { describe, expect, it } from "vitest";
import { targetOf } from "@/lib/site-agent.atomic";
import type { AgentAction } from "@/lib/site-agent";

describe("site-agent atomic journal coverage", () => {
  it("journals section visual edits so rollback can restore them", () => {
    const action: AgentAction = {
      type: "set_section_visual",
      sectionId: "section-1",
      patch: { layout: "layered", card_style: "floating" },
    };
    expect(targetOf(action)).toEqual({
      kind: "update",
      table: "website_sections",
      id: "section-1",
    });
  });

  it("journals component visual edits so rollback can restore them", () => {
    const action: AgentAction = {
      type: "set_component_visual",
      componentId: "component-1",
      patch: { radius: "large", shadow: "strong" },
    };
    expect(targetOf(action)).toEqual({
      kind: "update",
      table: "website_components",
      id: "component-1",
    });
  });

  it("journals generated image attachment so rollback restores the prior component", () => {
    const action: AgentAction = {
      type: "generate_component_image",
      componentId: "component-1",
      prompt: "Cinematic automotive detailing photograph with controlled studio lighting",
      alt: "Detailer working on a vehicle",
      mode: "replace",
    };
    expect(targetOf(action)).toEqual({
      kind: "update",
      table: "website_components",
      id: "component-1",
    });
  });

  it("journals component reordering as a multi-row update", () => {
    const action: AgentAction = {
      type: "reorder_components",
      sectionId: "section-1",
      componentIds: ["c1", "c2", "c3"],
    };
    expect(targetOf(action)).toEqual({
      kind: "updateMany",
      table: "website_components",
      ids: ["c1", "c2", "c3"],
    });
  });

  it("keeps unsupported actions fail-closed", () => {
    const action = { type: "unknown_action" } as unknown as AgentAction;
    expect(targetOf(action)).toBeNull();
  });
});
