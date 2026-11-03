import { afterEach, describe, expect, it } from "vitest";
import { ROLE_TIMEOUT_DEFAULTS_MS, roleTimeoutMs } from "@/lib/ai/config";

const KEYS = ["AI_ROLE_TIMEOUT_MS_DESIGN", "AI_ROLE_TIMEOUT_MS_FAST", "AI_ROLE_TIMEOUT_MS_VISION"];
afterEach(() => {
  for (const key of KEYS) delete process.env[key];
});

describe("role-specific AI timeouts (T010)", () => {
  it("gives design and wording 180s and quick calls 60s", () => {
    expect(ROLE_TIMEOUT_DEFAULTS_MS.primary).toBe(180_000);
    expect(roleTimeoutMs("design", { requestTimeoutMs: 90_000 })).toBe(180_000);
    expect(roleTimeoutMs("primary", { requestTimeoutMs: 90_000 })).toBe(180_000);
    expect(roleTimeoutMs("fast", { requestTimeoutMs: 90_000 })).toBe(60_000);
  });

  it("keeps AI_REQUEST_TIMEOUT_MS for roles without a default", () => {
    expect(roleTimeoutMs("vision", { requestTimeoutMs: 90_000 })).toBe(90_000);
    expect(roleTimeoutMs("coding", { requestTimeoutMs: 75_000 })).toBe(75_000);
  });

  it("lets an operator tune one role with AI_ROLE_TIMEOUT_MS_<ROLE>", () => {
    process.env["AI_ROLE_TIMEOUT_MS_FAST"] = "45000";
    process.env["AI_ROLE_TIMEOUT_MS_VISION"] = "not-a-number";
    expect(roleTimeoutMs("fast", { requestTimeoutMs: 90_000 })).toBe(45_000);
    expect(roleTimeoutMs("vision", { requestTimeoutMs: 90_000 })).toBe(90_000);
  });
});
