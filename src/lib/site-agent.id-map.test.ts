import { describe, expect, it } from "vitest";
import { resolveActionWithIdMap } from "@/lib/site-agent.functions";

describe("site-agent temporary ID resolution", () => {
  it("resolves a persisted temporary section reference", () => {
    const action = resolveActionWithIdMap(
      {
        type: "set_section_text",
        sectionId: "temp-section-1",
        field: "heading",
        value: "New heading",
      },
      new Map([["temp-section-1", "11111111-1111-4111-8111-111111111111"]]),
    );

    expect(action).toMatchObject({
      type: "set_section_text",
      sectionId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("resolves all IDs in cross-batch reorder actions", () => {
    const action = resolveActionWithIdMap(
      {
        type: "reorder_components",
        sectionId: "temp-section-1",
        componentIds: ["temp-component-1", "22222222-2222-4222-8222-222222222222"],
      },
      new Map([
        ["temp-section-1", "11111111-1111-4111-8111-111111111111"],
        ["temp-component-1", "33333333-3333-4333-8333-333333333333"],
      ]),
    );

    expect(action).toMatchObject({
      sectionId: "11111111-1111-4111-8111-111111111111",
      componentIds: [
        "33333333-3333-4333-8333-333333333333",
        "22222222-2222-4222-8222-222222222222",
      ],
    });
  });
});
