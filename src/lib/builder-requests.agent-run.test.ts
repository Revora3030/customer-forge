import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";

describe("conversational remember persists agentRunId (PAI-15)", () => {
  it("saves taskResult.complete with agentRunId on the assistant remember turn", () => {
    const source = readFileSync(resolve(__dirname, "builder-requests.hooks.ts"), "utf8");
    const start = source.indexOf('if ("conversational" in result && result.conversational)');
    expect(start).toBeGreaterThan(-1);
    const block = source.slice(start, start + 1200);
    expect(block).toContain("taskResult: { state: \"complete\"");
    expect(block).toContain("agentRunId");
    expect(block).toContain("remember(");
  });
});
