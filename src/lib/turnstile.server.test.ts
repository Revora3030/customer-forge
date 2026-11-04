import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetTurnstileWarning, leadCaptchaDecision, turnstileConfigured, verifyTurnstileToken, TURNSTILE_SITEVERIFY_URL } from "./turnstile.server";
import { turnstileHostAllowed, turnstilePayload, turnstileSiteKey, TURNSTILE_FIELD } from "./turnstile";

const env = { CLOUDFLARE_TURNSTILE_SECRET_KEY: "test-secret" };
const buildEnv = { VITE_CLOUDFLARE_TURNSTILE_SITE_KEY: "test-site-key" };
const host = "revoragrowthsystems.com";

function fakeFetch(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

afterEach(() => {
  vi.restoreAllMocks();
  __resetTurnstileWarning();
});

describe("turnstile config (fail-open when keys are missing)", () => {
  it("needs both the secret and the site key", () => {
    expect(turnstileConfigured(env, buildEnv)).toBe(true);
    expect(turnstileConfigured({}, buildEnv)).toBe(false);
    expect(turnstileConfigured(env, {})).toBe(false);
    expect(turnstileConfigured({ CLOUDFLARE_TURNSTILE_SECRET_KEY: "  " }, buildEnv)).toBe(false);
  });

  it("skips verification, warns once, and never calls Cloudflare without keys", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchImpl = fakeFetch({ success: false });
    expect(await verifyTurnstileToken("tok", { host, env: {}, buildEnv: {}, fetchImpl })).toBe("skipped");
    expect(await verifyTurnstileToken("", { host, env: {}, buildEnv: {}, fetchImpl })).toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("skips customer domains the widget can't cover", async () => {
    const fetchImpl = fakeFetch({ success: false });
    expect(await verifyTurnstileToken("tok", { host: "acmeplumbing.com", env, buildEnv, fetchImpl })).toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("verifyTurnstileToken", () => {
  it("posts the secret, token and real client IP to siteverify", async () => {
    const fetchImpl = fakeFetch({ success: true });
    expect(await verifyTurnstileToken("tok", { host, ip: "203.0.113.9", env, buildEnv, fetchImpl })).toBe("verified");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TURNSTILE_SITEVERIFY_URL);
    expect(init.method).toBe("POST");
    const body = init.body as URLSearchParams;
    expect(body.get("secret")).toBe("test-secret");
    expect(body.get("response")).toBe("tok");
    expect(body.get("remoteip")).toBe("203.0.113.9");
  });

  it("never forwards the edge:host fallback as an IP", async () => {
    const fetchImpl = fakeFetch({ success: true });
    await verifyTurnstileToken("tok", { host, ip: "edge:revoragrowthsystems.com", env, buildEnv, fetchImpl });
    expect(((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams).has("remoteip")).toBe(false);
  });

  it("missing token is 'missing', oversized token is 'invalid'", async () => {
    const fetchImpl = fakeFetch({ success: true });
    expect(await verifyTurnstileToken("", { host, env, buildEnv, fetchImpl })).toBe("missing");
    expect(await verifyTurnstileToken(undefined, { host, env, buildEnv, fetchImpl })).toBe("missing");
    expect(await verifyTurnstileToken("x".repeat(2049), { host, env, buildEnv, fetchImpl })).toBe("invalid");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a rejected token is 'invalid'; a spent token (retry) is 'missing'", async () => {
    expect(await verifyTurnstileToken("tok", { host, env, buildEnv, fetchImpl: fakeFetch({ success: false, "error-codes": ["invalid-input-response"] }) })).toBe("invalid");
    expect(await verifyTurnstileToken("tok", { host, env, buildEnv, fetchImpl: fakeFetch({ success: false, "error-codes": ["timeout-or-duplicate"] }) })).toBe("missing");
  });

  it("our misconfiguration, HTTP errors, network failures and timeouts are 'unavailable' (fail open)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await verifyTurnstileToken("tok", { host, env, buildEnv, fetchImpl: fakeFetch({ success: false, "error-codes": ["invalid-input-secret"] }) })).toBe("unavailable");
    expect(await verifyTurnstileToken("tok", { host, env, buildEnv, fetchImpl: fakeFetch({}, 503) })).toBe("unavailable");
    const down = vi.fn(async () => {
      throw new TypeError("network");
    });
    expect(await verifyTurnstileToken("tok", { host, env, buildEnv, fetchImpl: down as unknown as typeof fetch })).toBe("unavailable");
    const timeout = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    expect(await verifyTurnstileToken("tok", { host, env, buildEnv, fetchImpl: timeout as unknown as typeof fetch })).toBe("unavailable");
  });
});

describe("leadCaptchaDecision", () => {
  it("keeps today's behaviour when Turnstile is skipped: only a forged ALTCHA is dropped", () => {
    expect(leadCaptchaDecision("skipped", "verified")).toBe("accept");
    expect(leadCaptchaDecision("skipped", "missing")).toBe("accept");
    expect(leadCaptchaDecision("skipped", "unavailable")).toBe("accept");
    expect(leadCaptchaDecision("skipped", "invalid")).toBe("drop");
  });

  it("drops a token Cloudflare rejected", () => {
    expect(leadCaptchaDecision("invalid", "verified")).toBe("drop");
  });

  it("accepts on a verifier outage", () => {
    expect(leadCaptchaDecision("unavailable", "missing")).toBe("accept");
  });

  it("a missing token needs ALTCHA proof (or ALTCHA being down)", () => {
    expect(leadCaptchaDecision("missing", "verified")).toBe("accept");
    expect(leadCaptchaDecision("missing", "unavailable")).toBe("accept");
    expect(leadCaptchaDecision("missing", "missing")).toBe("drop");
  });
});

describe("turnstile shared helpers", () => {
  it("only Revora-owned hosts (and their subdomains) get the widget", () => {
    for (const ok of ["revoragrowthsystems.com", "www.revoragrowthsystems.com", "revoraweb.site", "acme.revoraweb.site", "REVORAGROWTHSYSTEMS.COM:443"]) {
      expect(turnstileHostAllowed(ok)).toBe(true);
    }
    for (const no of ["acmeplumbing.com", "revoragrowthsystems.com.evil.io", "evilrevoraweb.site", "", null, "localhost"]) { // DevSkim: ignore DS162092 -- Negative fixture: localhost must be rejected.
      expect(turnstileHostAllowed(no)).toBe(false);
    }
  });

  it("reads the site key from the build env only", () => {
    expect(turnstileSiteKey(buildEnv)).toBe("test-site-key");
    expect(turnstileSiteKey({})).toBe("");
  });

  it("reads and caps the token from the form", () => {
    const form = new FormData();
    expect(turnstilePayload(form)).toBe("");
    form.set(TURNSTILE_FIELD, "y".repeat(3000));
    expect(turnstilePayload(form)).toHaveLength(2048);
  });
});
