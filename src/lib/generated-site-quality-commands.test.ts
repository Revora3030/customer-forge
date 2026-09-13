import { expect, test } from "vitest";
import { commandFromQualityRecommendation } from "./generated-site-quality-commands";

test("requires approval for factual-trust changes", () => {
  const command = commandFromQualityRecommendation({
    dimension: "trustAndFacts",
    priority: "critical",
    action: "Verify or remove unsupported trust proof.",
  });
  expect(command.scope).toBe("claims");
  expect(command.requiresApproval).toBe(true);
  expect(command.prompt).toContain("Do not change business facts");
});

test("creates a focused proposed edit for responsive fixes", () => {
  const command = commandFromQualityRecommendation({
    dimension: "responsiveUx",
    priority: "critical",
    action: "Fix mobile overflow.",
  });
  expect(command.scope).toBe("responsive");
  expect(command.requiresApproval).toBe(false);
  expect(command.prompt).toContain("persisted design profile");
});
