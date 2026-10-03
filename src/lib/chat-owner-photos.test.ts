import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readActions } from "@/lib/site-agent";

const fns = readFileSync("src/lib/site-agent.functions.ts", "utf8");
const plan = readFileSync("src/lib/builder/ai-agent-plan.server.ts", "utf8");

describe("photos attached in the builder chat reach the site", () => {
  it("saves attached photos to the library as owner photos before planning", () => {
    expect(fns).toMatch(/const ownerUploads: \{ name: string; path: string \}\[\] = \[\];/);
    expect(fns.indexOf("const ownerUploads")).toBeLessThan(fns.indexOf("await planWebsiteChangesWithAi({"));
    expect(fns).toMatch(/source: "owner",\n\s*\} as never\);\n\s*if \(row\.error\)/);
  });

  it("gives the planner each saved photo's path and tells it how to place it", () => {
    expect(plan).toMatch(/THE OWNER'S PHOTOS ARE SAVED/);
    expect(plan).toMatch(/patch\.media_url set to its exact path/);
  });

  it("keeps a workspace storage path through the plan reader", () => {
    const org = "11111111-2222-3333-4444-555555555555";
    const actions = readActions(
      [{ type: "set_component_visual", componentId: "c1", patch: { media_url: `${org}/van-photo-abc.jpg`, alt: "Our van" } }],
      { pageIds: new Set(), sectionIds: new Set(), componentIds: new Set(["c1"]) },
    );
    const visual = actions.find((action) => action.type === "set_component_visual") as
      | { patch: { media_url?: string | null } }
      | undefined;
    expect(visual?.patch.media_url).toBe(`${org}/van-photo-abc.jpg`);
  });

  it("only accepts storage paths inside the current workspace when applying", () => {
    expect(fns).toMatch(/mediaUrl\.startsWith\(`\$\{orgId\}\/`\)/);
  });
});
