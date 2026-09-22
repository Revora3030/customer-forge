import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const customerPlanner = readFileSync(
  new URL("../site-agent.functions.ts", import.meta.url),
  "utf8",
);

const aiPlanner = readFileSync(
  new URL("../builder/ai-agent-plan.server.ts", import.meta.url),
  "utf8",
);

describe("customer website planning is AI-authored", () => {
  it("routes every customer build and edit request to the AI design team", () => {
    expect(customerPlanner).toContain('import("@/lib/builder/ai-agent-plan.server")');
    expect(customerPlanner).toContain("planWebsiteChangesWithAi");
  });

  it("no longer uses the deterministic template engine for creative decisions", () => {
    expect(customerPlanner).not.toContain("buildAutonomousPlan");
    expect(customerPlanner).not.toContain("Built with Revora's own engine — no outside AI involved.");
    expect(customerPlanner).toContain("model: planModel,");
  });

  it("fails loudly instead of falling back to a stock layout", () => {
    expect(customerPlanner).toContain("I'd rather wait than drop a stock layout onto your site.");
    expect(aiPlanner).toContain("review_rejected");
    expect(aiPlanner).toContain("unusable_answer");
  });

  it("keeps the truthfulness and design guardrails in the AI planner", () => {
    expect(aiPlanner).toContain("Never invent a fact");
    expect(aiPlanner).toContain("Never write placeholder or filler text");
    expect(aiPlanner).toContain("adversarial_review");
  });
});
