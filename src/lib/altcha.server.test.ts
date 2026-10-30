import { describe, expect, it } from "vitest";
import { createChallenge, solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/web/sha";
import { altchaHmacKey, createAltchaChallenge, verifyAltchaPayload } from "./altcha.server";

const KEY = "test-altcha-key-0123456789abcdef";

async function solvedPayload(key = KEY, expiresAt = new Date(Date.now() + 60_000)) {
  // A tiny counter keeps the test fast; production uses 20k–60k.
  const challenge = await createChallenge({
    algorithm: "SHA-256",
    cost: 1,
    counter: 40,
    deriveKey,
    hmacSignatureSecret: key,
    expiresAt,
  });
  const solution = await solveChallenge({ challenge, deriveKey });
  return { challenge, solution, payload: btoa(JSON.stringify({ challenge, solution })) };
}

describe("verifyAltchaPayload", () => {
  it("accepts a solved, signed, unexpired challenge", async () => {
    const { payload } = await solvedPayload();
    expect(await verifyAltchaPayload(payload, KEY)).toBe("verified");
  });

  it("treats an empty payload as missing (fail open)", async () => {
    expect(await verifyAltchaPayload("", KEY)).toBe("missing");
    expect(await verifyAltchaPayload(undefined, KEY)).toBe("missing");
  });

  it("is unavailable (fail open) without a key", async () => {
    const { payload } = await solvedPayload();
    expect(await verifyAltchaPayload(payload, null)).toBe("unavailable");
  });

  it("rejects a challenge signed with another key", async () => {
    const { payload } = await solvedPayload("some-other-key-0123456789");
    expect(await verifyAltchaPayload(payload, KEY)).toBe("invalid");
  });

  it("rejects a tampered solution", async () => {
    const { challenge, solution } = await solvedPayload();
    const forged = btoa(JSON.stringify({ challenge, solution: { ...solution, counter: (solution?.counter ?? 0) + 1 } }));
    expect(await verifyAltchaPayload(forged, KEY)).toBe("invalid");
  });

  it("rejects an expired challenge", async () => {
    const { payload } = await solvedPayload(KEY, new Date(Date.now() - 1_000));
    expect(await verifyAltchaPayload(payload, KEY)).toBe("invalid");
  });

  it("rejects the widget's test-mode payload, garbage and oversized input", async () => {
    expect(await verifyAltchaPayload(btoa(JSON.stringify({ challenge: null, solution: null, test: true })), KEY)).toBe(
      "invalid",
    );
    expect(await verifyAltchaPayload("not base64 json", KEY)).toBe("invalid");
    expect(await verifyAltchaPayload("a".repeat(5000), KEY)).toBe("invalid");
  });
});

describe("altchaHmacKey", () => {
  it("prefers a dedicated ALTCHA_HMAC_KEY", async () => {
    expect(await altchaHmacKey({ ALTCHA_HMAC_KEY: KEY, SUPABASE_SERVICE_ROLE_KEY: "srk" })).toBe(KEY);
  });

  it("derives a stable key that is not the service-role key itself", async () => {
    const a = await altchaHmacKey({ SUPABASE_SERVICE_ROLE_KEY: "service-role-value" });
    const b = await altchaHmacKey({ SUPABASE_SERVICE_ROLE_KEY: "service-role-value" });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("service-role-value");
  });

  it("returns null with no secret at all", async () => {
    expect(await altchaHmacKey({})).toBeNull();
  });
});

describe("createAltchaChallenge", () => {
  it("issues a signed, expiring SHA-256 challenge", async () => {
    const challenge = await createAltchaChallenge(KEY);
    expect(challenge?.signature).toBeTruthy();
    expect(challenge?.parameters.algorithm).toBe("SHA-256");
    expect(challenge?.parameters.expiresAt).toBeGreaterThan(Date.now() / 1000);
  });

  it("returns null without a key", async () => {
    expect(await createAltchaChallenge(null)).toBeNull();
  });
});
