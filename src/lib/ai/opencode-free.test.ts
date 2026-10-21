import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isolateProviderEnvironment } from "./provider-test-environment";
import { freeProviderCredentials, isFreeEligibleModel } from "./free";

describe("OpenCode Zen free lane", () => {
  beforeEach(() => isolateProviderEnvironment());
  afterEach(() => vi.unstubAllEnvs());
  it("is off without a key", () => {
    expect(freeProviderCredentials("opencode")).toBeNull();
    vi.stubEnv("OPENCODE_API_KEY", "k");
    expect(freeProviderCredentials("opencode")).toEqual({ apiKey: "k" });
  });
  it("accepts only -free ids", () => {
    expect(isFreeEligibleModel("opencode", "glm-5.3-flash-free")).toBe(true);
    expect(isFreeEligibleModel("opencode", "claude-haiku-4-5")).toBe(false);
    expect(isFreeEligibleModel("opencode", "big-pickle")).toBe(false);
  });
});
