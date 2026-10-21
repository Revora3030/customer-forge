import { afterEach, describe, expect, it, vi } from "vitest";
import { JARVIS_DIAGNOSTIC_TOOLS } from "./jarvis-tool-registry";
import { isRunnableReadiness, jarvisToolReadiness } from "./jarvis-tool-readiness";

const SECRETS = [
  "GOOGLE_PAGESPEED_API_KEY", "BROWSERLESS_API_KEY", "BROWSERBASE_API_KEY", "CONTEXT7_API_KEY",
  "UNSPLASH_ACCESS_KEY", "PEXELS_API_KEY", "OMNIROUTE_BASE_URL", "OMNIROUTE_API_KEY",
  "LOVABLE_API_KEY", "GOOGLE_CALENDAR_API_KEY", "GOOGLE_SHEETS_API_KEY", "CLOUDFLARE_API_KEY",
  "RESEND_API_KEY", "REVORA_GITHUB_READ_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_AI_API_TOKEN",
  "CLOUDFLARE_API_TOKEN", "HUGGINGFACE_API_KEY", "HF_TOKEN", "POLLINATIONS_API_KEY",
];

function clearSecrets() {
  for (const name of SECRETS) vi.stubEnv(name, "");
}

afterEach(() => { vi.unstubAllEnvs(); });

describe("jarvisToolReadiness", () => {
  it("covers every registered diagnostic tool", () => {
    clearSecrets();
    const readiness = jarvisToolReadiness();
    for (const tool of JARVIS_DIAGNOSTIC_TOOLS) expect(readiness[tool.id]).toBeDefined();
  });

  it("reports PageSpeed as runnable on the shared free quota without a key, and key_present with one", () => {
    clearSecrets();
    expect(jarvisToolReadiness()["website.lighthouse.audit"]).toEqual({ state: "keyless_shared_quota", secretName: "GOOGLE_PAGESPEED_API_KEY" });
    expect(isRunnableReadiness(jarvisToolReadiness()["website.lighthouse.audit"])).toBe(true);
    vi.stubEnv("GOOGLE_PAGESPEED_API_KEY", "psi-secret-value-123");
    expect(jarvisToolReadiness()["website.lighthouse.audit"]).toEqual({ state: "key_present", secretName: "GOOGLE_PAGESPEED_API_KEY" });
  });

  it("marks Hugging Face and Pollinations images not implemented even when keys are saved", () => {
    vi.stubEnv("HUGGINGFACE_API_KEY", "hf-secret-value-456");
    vi.stubEnv("POLLINATIONS_API_KEY", "poll-secret-value-789");
    const readiness = jarvisToolReadiness();
    expect(readiness["image.huggingface"]).toEqual({ state: "not_implemented" });
    expect(readiness["image.pollinations"]).toEqual({ state: "not_implemented" });
    expect(isRunnableReadiness(readiness["image.huggingface"])).toBe(false);
  });

  it("names missing secrets for keyed tools and is runnable only when they are present", () => {
    clearSecrets();
    const missing = jarvisToolReadiness();
    expect(missing["website.browser.check"]).toEqual({ state: "needs_key", secretName: "BROWSERLESS_API_KEY" });
    expect(missing["workspace.calendar.upcoming"]).toEqual({ state: "needs_key", secretName: "LOVABLE_API_KEY and GOOGLE_CALENDAR_API_KEY" });
    expect(missing["website.html.audit"]).toEqual({ state: "keyless" });
    expect(isRunnableReadiness(missing["website.browser.check"])).toBe(false);
    vi.stubEnv("BROWSERLESS_API_KEY", "bl-secret-value");
    expect(jarvisToolReadiness()["website.browser.check"].state).toBe("key_present");
  });

  it("never returns a stubbed secret value", () => {
    const values = SECRETS.map((name, index) => `secret-value-${index}-${name.toLowerCase()}`);
    SECRETS.forEach((name, index) => vi.stubEnv(name, values[index]!));
    const serialized = JSON.stringify(jarvisToolReadiness());
    for (const value of values) expect(serialized).not.toContain(value);
  });
});
