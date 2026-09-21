import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const customerPlanner = readFileSync(
  new URL("../site-agent.functions.ts", import.meta.url),
  "utf8",
);

describe("customer website planning boundary", () => {
  it("cannot dispatch customer requests to Luna or external model orchestration", () => {
    expect(customerPlanner).not.toContain('import("@/lib/ai/luna.server")');
    expect(customerPlanner).not.toContain('import("@/lib/agent/orchestrator.server")');
    expect(customerPlanner).not.toContain('import("@/lib/site-agent.server")');
    expect(customerPlanner).not.toContain('import("@/lib/builder/ai-composition.server")');
    expect(customerPlanner).not.toContain('import("@/lib/ai/availability")');
    expect(customerPlanner).not.toContain('import("@/lib/ai/ensemble.server")');
  });

  it("records native-only execution in the customer-visible evidence", () => {
    expect(customerPlanner).toContain("Built with Revora's own engine — no outside AI involved.");
    expect(customerPlanner).toContain('model: "revora-ai"');
  });
});