import { describe, expect, it } from "vitest";
import { DEFAULT_AUTONOMY_POLICY } from "./upgrade-contract";

describe("autonomous builder contract", () => {
  it("keeps execution boundaries outside the intelligence layer", () => {
    expect(DEFAULT_AUTONOMY_POLICY.preserveExistingExecutor).toBe(true);
    expect(DEFAULT_AUTONOMY_POLICY.preserveBusinessFacts).toBe(true);
    expect(DEFAULT_AUTONOMY_POLICY.allowBroadPlanning).toBe(true);
  });

  it("requires confirmation for high-impact operations", () => {
    expect(DEFAULT_AUTONOMY_POLICY.requireConfirmationFor).toEqual(
      expect.arrayContaining(["billing", "authentication", "publishing", "destructive changes"]),
    );
  });
});
