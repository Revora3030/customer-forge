import { describe, expect, it } from "vitest";
import { estimateSignatureIpSalt } from "./signature-salt.server";

describe("estimateSignatureIpSalt", () => {
  it("uses the dedicated secret when it is set", () => {
    expect(estimateSignatureIpSalt({ ESTIMATE_SIGNATURE_IP_SALT: "x".repeat(32), SUPABASE_SERVICE_ROLE_KEY: "svc" })).toBe("x".repeat(32));
  });
  it("falls back to the service-role key when the dedicated secret is missing or too short", () => {
    expect(estimateSignatureIpSalt({ SUPABASE_SERVICE_ROLE_KEY: "svc" })).toBe("svc");
    expect(estimateSignatureIpSalt({ ESTIMATE_SIGNATURE_IP_SALT: "short", SUPABASE_SERVICE_ROLE_KEY: "svc" })).toBe("svc");
  });
  it("is empty when neither exists", () => {
    expect(estimateSignatureIpSalt({})).toBe("");
  });
});
