import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isolateProviderEnvironment } from "./provider-test-environment";
import { freeProviderCredentials, isFreeEligibleModel } from "./free";

describe("OmniRoute free lane", () => {
  beforeEach(() => isolateProviderEnvironment());
  afterEach(() => vi.unstubAllEnvs());
  it("stays off until both address and key are set", () => {
    expect(freeProviderCredentials("omniroute")).toBeNull();
    vi.stubEnv("OMNIROUTE_API_KEY", "k");
    expect(freeProviderCredentials("omniroute")).toBeNull();
    vi.stubEnv("OMNIROUTE_BASE_URL", "http://insecure.example.com/v1");
    expect(freeProviderCredentials("omniroute")).toBeNull();
    vi.stubEnv("OMNIROUTE_BASE_URL", "https://omni.example.com/v1");
    expect(freeProviderCredentials("omniroute")).toEqual({ apiKey: "k" });
  });
  it("treats no OmniRoute model as free unless the owner lists it", () => {
    expect(isFreeEligibleModel("omniroute", "gpt-5")).toBe(false);
    vi.stubEnv("OMNIROUTE_FREE_MODELS", "my-free-combo");
    expect(isFreeEligibleModel("omniroute", "my-free-combo")).toBe(true);
    expect(isFreeEligibleModel("omniroute", "gpt-5")).toBe(false);
  });
});
