import { describe, expect, it } from "vitest";
import { dropUnchangedActions } from "@/lib/builder/apply-plan";
import type { AgentAction } from "@/lib/site-agent";

/**
 * A style step whose payload was stripped to nothing is NOT "already correct".
 * Reporting it as applied is what made the builder's own numbers untrustworthy,
 * so an empty patch must survive the no-op filter and be reported honestly.
 */
describe("empty style patches are not silent no-ops", () => {
  const state = {
    sections: new Map([
      ["s1", { id: "s1", heading: "A", subheading: null, body: null, variant: null, is_visible: true, settings: {} }],
    ]),
    components: new Map(),
  } as unknown as Parameters<typeof dropUnchangedActions>[1];

  it("keeps a set_block_style step with an empty patch", () => {
    const action = {
      type: "set_block_style",
      target: "section",
      targetId: "s1",
      device: "desktop",
      patch: {},
    } as unknown as AgentAction;
    const result = dropUnchangedActions([action], state);
    expect(result.actions).toHaveLength(1);
    expect(result.unchanged).toBe(0);
  });

  it("still drops a genuinely matching style step", () => {
    const action = {
      type: "set_section_visual",
      sectionId: "s1",
      patch: {},
    } as unknown as AgentAction;
    expect(dropUnchangedActions([action], state).actions).toHaveLength(1);
  });
});
