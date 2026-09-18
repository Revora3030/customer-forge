import { describe, expect, it } from "vitest";
import type { AgentAction } from "@/lib/site-agent";
import { blueprintTrace, buildExecutionBlueprint } from "./execution-blueprint";

const action = (type: string): AgentAction => ({ type } as AgentAction);

describe("execution blueprint", () => {
  it("groups native actions into deterministic phases with dependencies", () => {
    const blueprint = buildExecutionBlueprint([
      action("set_theme"),
      action("set_section_text"),
      action("add_section"),
      action("set_business_fact"),
      action("set_page"),
    ]);

    expect(blueprint.totalActions).toBe(5);
    expect(blueprint.phases).toEqual([
      "structure",
      "content",
      "visual",
      "conversion",
      "seo",
    ]);
    expect(blueprint.steps[1]?.dependsOn).toEqual(["phase-structure"]);
    expect(blueprint.steps[2]?.dependsOn).toEqual(["phase-content"]);
    expect(blueprint.parallelizable).toEqual([["phase-content", "phase-visual"]]);
  });

  it("keeps unknown action types inside verification instead of dropping them", () => {
    const blueprint = buildExecutionBlueprint([action("future_action")]);
    expect(blueprint.steps).toHaveLength(1);
    expect(blueprint.steps[0]?.phase).toBe("verification");
    expect(blueprint.steps[0]?.actionTypes).toEqual(["future_action"]);
  });

  it("produces an explainable v9 trace", () => {
    const blueprint = buildExecutionBlueprint([action("add_page"), action("set_theme")]);
    const trace = blueprintTrace(blueprint);
    expect(trace).toContain("Autonomous Brain v9");
    expect(trace).toContain("2-phase execution blueprint");
  });
});
