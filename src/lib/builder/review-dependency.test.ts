import { describe, expect, it } from "vitest";
import { applyReview } from "./ai-agent-plan.server";

describe("reviewer rejections keep dependencies intact", () => {
  it("never reinstates a rejected section when a kept action fills it", () => {
    const actions = [
      { type: "add_section", ref: "temp_section_1", pageId: "p", kind: "hours", heading: "Hours" },
      { type: "add_component", sectionId: "temp_section_1", kind: "text", body: "Open 24 hours" },
    ];
    const out = applyReview(actions, { reject: [0], notes: [] });
    expect(out.actions).toHaveLength(0);
  });
  it("cascades rejected image references through nested compositions", () => {
    const actions = [
      { type: "add_component", ref: "temp_image", sectionId: "s", kind: "image" },
      { type: "set_composition", sectionId: "s", tree: { root: { type: "media", mediaRef: "temp_image" } } },
    ];
    expect(applyReview(actions, { reject: [0] }).actions).toEqual([]);
  });
  it("still rejects an unused creation and plain rejected actions", () => {
    const actions = [
      { type: "add_section", ref: "temp_section_1", pageId: "p", kind: "x" },
      { type: "update_section", sectionId: "s1", heading: "Fake award" },
    ];
    expect(applyReview(actions, { reject: [0, 1] }).actions).toHaveLength(0);
  });
});
