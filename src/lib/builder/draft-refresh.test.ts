import { describe, expect, it } from "vitest";
import { shouldRefreshDraft } from "./draft-refresh";

const current = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
describe("workspace-bound draft refresh", () => {
  it("refreshes saved changes from the current workspace", () => {
    expect(shouldRefreshDraft({ type: "draft-changed", organizationId: current, at: 123 }, current)).toBe(true);
  });
  it("ignores other workspaces, missing workspace and malformed messages", () => {
    expect(shouldRefreshDraft({ type: "draft-changed", organizationId: other, at: 123 }, current)).toBe(false);
    expect(shouldRefreshDraft({ type: "draft-changed", organizationId: current }, undefined)).toBe(false);
    expect(shouldRefreshDraft({ type: "different", organizationId: current }, current)).toBe(false);
  });
});