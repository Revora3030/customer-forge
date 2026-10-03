import { describe, expect, it } from "vitest";
import type { AgentAction } from "@/lib/site-agent";
import { preflightActions } from "./apply-plan";

const PAGE = "11111111-1111-4111-8111-111111111111";
const SECTION = "22222222-2222-4222-8222-222222222222";

describe("set_block_style targets", () => {
  it("keeps a style step aimed at a section created earlier in the same plan", () => {
    const actions = [
      { type: "set_block_style", target: "section", targetId: "temp_hero", device: "desktop", patch: { bgColor: "#07111F" } },
      { type: "add_section", pageId: PAGE, ref: "temp_hero", kind: "hero" },
    ] as unknown as AgentAction[];
    const result = preflightActions(actions, { pageIds: new Set([PAGE]), sectionIds: new Set(), componentIds: new Set() });
    expect(result.stale).toEqual([]);
    expect(result.ok.map((a) => a.type)).toEqual(["add_section", "set_block_style"]);
  });

  it("reports a style step whose block no longer exists instead of sending it", () => {
    const actions = [
      { type: "set_block_style", target: "component", targetId: "33333333-3333-4333-8333-333333333333", device: "desktop", patch: { radius: 8 } },
      { type: "set_block_style", target: "section", targetId: SECTION, device: "desktop", patch: { padTop: 40 } },
    ] as unknown as AgentAction[];
    const result = preflightActions(actions, { pageIds: new Set([PAGE]), sectionIds: new Set([SECTION]), componentIds: new Set() });
    expect(result.ok).toHaveLength(1);
    expect(result.stale).toEqual([{ type: "set_block_style", target: "33333333-3333-4333-8333-333333333333", reason: "missing_component" }]);
  });
});
