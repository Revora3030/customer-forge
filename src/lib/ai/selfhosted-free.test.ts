import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isolateProviderEnvironment } from "./provider-test-environment";
import { freeProviderCredentials, isFreeEligibleModel } from "./free";

describe("self-hosted gateway free lane", () => {
  beforeEach(() => isolateProviderEnvironment());
  afterEach(() => vi.unstubAllEnvs());
  it("stays off until a public https address and key are set", () => {
    vi.stubEnv("SELFHOSTED_AI_API_KEY", "k");
    expect(freeProviderCredentials("selfhosted")).toBeNull();
    vi.stubEnv("SELFHOSTED_AI_BASE_URL", "https://localhost:4000/v1");
    expect(freeProviderCredentials("selfhosted")).toBeNull();
    vi.stubEnv("SELFHOSTED_AI_BASE_URL", "https://llm.example.com/v1");
    expect(freeProviderCredentials("selfhosted")).toEqual({ apiKey: "k" });
  });
  it("uses only models the owner lists as free", () => {
    expect(isFreeEligibleModel("selfhosted", "llama-3.3")).toBe(false);
    vi.stubEnv("SELFHOSTED_AI_FREE_MODELS", "llama-3.3");
    expect(isFreeEligibleModel("selfhosted", "llama-3.3")).toBe(true);
  });
});
