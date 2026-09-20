import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROVIDERS, selectProvider } from "./capabilities";
import {
  callCapability,
  capabilitySnapshot,
  missingCredentials,
  providerStatus,
  resetIntegrationHealth,
  resolveCapability,
} from "./registry.server";

const OPTIONAL = [
  "FIRECRAWL_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "HUBSPOT_ACCESS_TOKEN",
  "SEMRUSH_API_KEY",
  "REPLICATE_API_TOKEN",
  "ELEVENLABS_API_KEY",
  "N8N_BASE_URL",
  "N8N_WEBHOOK_SECRET",
];

describe("capability registry", () => {
  beforeEach(() => {
    resetIntegrationHealth();
    for (const name of OPTIONAL) delete process.env[name];
    process.env["FREE_AI_ONLY"] = "true";
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serves web research with Revora's own reader when nothing is connected", async () => {
    const resolution = await resolveCapability("research.web");
    expect(resolution.provider?.id).toBe("revora-native-fetch");
    expect(resolution.deterministic).toBe(true);
  });

  it("refuses to use a paid provider while free-only mode is on", async () => {
    process.env["FIRECRAWL_API_KEY"] = "test-key";
    const resolution = await resolveCapability("research.web");
    expect(resolution.provider?.id).toBe("revora-native-fetch");
    expect(resolution.fallbacks.map((entry) => entry.id)).not.toContain("firecrawl");
  });

  it("never reports a capability as ready when no server code exists for it", async () => {
    process.env["TWILIO_ACCOUNT_SID"] = "sid";
    process.env["TWILIO_AUTH_TOKEN"] = "token";
    const sms = await resolveCapability("messaging.sms");
    expect(sms.provider).toBeNull();
    expect(sms.status).toBe("unavailable");
    expect(sms.deterministic).toBe(false);
  });

  it("reports needs_connection for an implemented provider with missing credentials", async () => {
    const resolution = await resolveCapability("automation.workflows");
    expect(resolution.provider).toBeNull();
    expect(resolution.status).toBe("needs_connection");
    expect(resolution.reason).toBe("needs_connection");
  });

  it("never returns a credential value, only the missing names", () => {
    process.env["N8N_BASE_URL"] = "https://example.com";
    const n8n = PROVIDERS.find((provider) => provider.id === "n8n")!;
    expect(missingCredentials(n8n)).toEqual(["N8N_WEBHOOK_SECRET"]);
    expect(providerStatus(n8n)).toBe("needs_connection");
  });

  it("returns an honest unavailable result instead of throwing when nothing can serve it", async () => {
    const result = await callCapability("media.voice", async () => "audio");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.attempts).toBe(0);
      expect(result.deterministic).toBe(false);
    }
  });

  it("fails over when a provider times out, and never throws into the builder", async () => {
    const result = await callCapability<string>(
      "research.web",
      async ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
      { timeoutMs: 5 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("timeout");
  });

  it("treats a malformed answer as a failure rather than shipping it", async () => {
    const result = await callCapability<string>("research.web", async () => "", {
      validate: (value) => value.length > 0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("malformed_response");
  });

  it("rests a provider after repeated failures so it stops being selected", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1)
      await callCapability("research.web", async () => {
        throw new Error("boom");
      });
    const resolution = await resolveCapability("research.web");
    expect(resolution.provider).toBeNull();
    expect(resolution.deterministic).toBe(true);
  });

  it("marks a provider runtime-verified only after a real call succeeds", async () => {
    let snapshot = await capabilitySnapshot();
    const before = snapshot
      .find((entry) => entry.capability === "research.web")!
      .providers.find((provider) => provider.id === "revora-native-fetch")!;
    expect(before.runtimeVerified).toBe(false);

    await callCapability("research.web", async () => "ok");
    snapshot = await capabilitySnapshot();
    const after = snapshot
      .find((entry) => entry.capability === "research.web")!
      .providers.find((provider) => provider.id === "revora-native-fetch")!;
    expect(after.runtimeVerified).toBe(true);
    expect(after.lastSuccessAt).not.toBeNull();
  });

  it("chooses the same provider as the pure selector", () => {
    const picked = selectProvider("email.transactional", () => true, { freeOnly: true });
    expect(picked?.id).toBe("lovable-email");
  });
});
