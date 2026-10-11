import { describe, expect, it } from "vitest";
import { isChatAuthorizationError, normaliseSavedTaskResult } from "./builder-chat-result";
describe("saved result JSON validation", () => {
  it("keeps valid existing result metadata", () => {
    expect(normaliseSavedTaskResult({ state: "complete", applied: 6, snapshotVersion: 12 })).toEqual({ state: "complete", applied: 6, snapshotVersion: 12 });
  });
  it.each([-1, NaN, Infinity, 1.5, "6", null])("does not trust invalid counts %s", (applied) => {
    expect(normaliseSavedTaskResult({ state: "complete", applied })).toEqual({ state: "complete" });
  });
  it.each([null, [], "failed", { state: "building" }])("rejects an invalid terminal result %s", (value) => {
    expect(normaliseSavedTaskResult(value)).toBeNull();
  });
  it("preserves non-retryable access errors without trusting a conflicting flag", () => {
    expect(normaliseSavedTaskResult({ state: "failed", retryable: true }, "Your free access has ended.")).toMatchObject({ state: "failed", retryable: false });
  });
  it("sanitizes internal failed-message data", () => {
    expect(normaliseSavedTaskResult({ state: "failed", error: "JWT private-token permission denied", retryable: false })?.error).not.toContain("private-token");
  });
  it.each([401, 403])("recognizes HTTP %i as an authorization rejection", (status) => {
    expect(isChatAuthorizationError({}, status)).toBe(true);
  });
  it.each(["42501", "PGRST301", "PGRST302"])("recognizes authorization code %s", (code) => {
    expect(isChatAuthorizationError({ code })).toBe(true);
  });
  it("does not classify network failure or a missing migration as denied access", () => {
    expect(isChatAuthorizationError({ message: "Failed to fetch" }, 0)).toBe(false);
    expect(isChatAuthorizationError({ code: "42703" }, 400)).toBe(false);
  });
});
