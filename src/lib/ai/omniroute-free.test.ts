import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isolateProviderEnvironment } from "./provider-test-environment";
import { freeCredentials } from "./free";

describe("OmniRoute free lane", () => {
  beforeEach(() => isolateProviderEnvironment());
  afterEach(() => vi.unstubAllEnvs());
  it("stays off until both address and key are set", () => {
    expect(freeCredentials("omniroute")).toBeNull();
    vi.stubEnv("OMNIROUTE_API_KEY", "k");
    expect(freeCredentials("omniroute")).toBeNull();
    vi.stubEnv("OMNIROUTE_BASE_URL", "http://insecure.example.com/v1");
    expect(freeCredentials("omniroute")).toBeNull();
    vi.stubEnv("OMNIROUTE_BASE_URL", "https://omni.example.com/v1");
    expect(freeCredentials("omniroute")).toEqual({ apiKey: "k" });
  });
});
