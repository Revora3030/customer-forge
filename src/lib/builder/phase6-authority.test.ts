import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { planAutonomousReleaseLoop } from "@/lib/agent/autonomous-release-loop";
import { buildExecutionBlueprint } from "./execution-blueprint";
import type { AgentAction } from "@/lib/site-agent";

describe("phase 6: AI layouts by default, approval is safety-only", () => {
  it("planner offers set_composition and makes it the default layout path", () => {
    const src = readFileSync("src/lib/builder/ai-agent-plan.server.ts", "utf8");
    expect(src).toContain('"type":"set_composition"');
    expect(src).toContain("DEFAULT LAYOUT RULE");
  });

  it("creative production work runs without approval; destructive/billing needs a human", () => {
    const base = { requestedActions: 40, runtimeAvailable: true, browserAvailable: true, productionTarget: true };
    expect(planAutonomousReleaseLoop({ ...base, destructive: false }).requiresApproval).toBe(false);
    expect(planAutonomousReleaseLoop({ ...base, destructive: true }).requiresApproval).toBe(true);
    expect(planAutonomousReleaseLoop({ ...base, destructive: false, accountOrBilling: true }).requiresApproval).toBe(true);
  });

  it("adding, reordering and composing sections needs no approval; deletions do", () => {
    const creative = [
      { type: "add_section", pageId: "p", ref: "temp_section_1", kind: "custom", heading: "h", subheading: "", body: "", position: 0 },
      { type: "reorder_sections", pageId: "p", sectionIds: ["a", "b"] },
      { type: "set_composition", sectionId: "temp_section_1", tree: { version: 1, root: { type: "stack" } } },
    ] as unknown as AgentAction[];
    expect(buildExecutionBlueprint(creative).requiresApproval).toBe(false);
    const destructive = [{ type: "delete_section", sectionId: "a" }] as unknown as AgentAction[];
    expect(buildExecutionBlueprint(destructive).requiresApproval).toBe(true);
  });

  it("model fallback hands over only to other models, never to rule-based design", () => {
    const luna = readFileSync("src/lib/ai/luna.server.ts", "utf8");
    expect(luna).toMatch(/length/);
    for (const f of ["src/lib/ai/luna.server.ts", "src/lib/ai/router.server.ts", "src/lib/ai/hall-of-fame.server.ts"]) {
      const s = readFileSync(f, "utf8");
      expect(s).not.toMatch(/createDesignFingerprint|SITE_ARCHETYPES|template-gallery|site-archetypes/);
    }
  });
});
