import { describe, expect, it } from "vitest";
import { baseSecurityHeaders, documentSecurityHeaders } from "./security-headers";

describe("security headers", () => {
  it("sets hardened baseline headers", () => {
    const headers = baseSecurityHeaders({ https: true });
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
    expect(headers["x-permitted-cross-domain-policies"]).toBe("none");
    expect(headers["origin-agent-cluster"]).toBe("?1");
    expect(headers["strict-transport-security"]).toContain("max-age=31536000");
  });

  it("keeps HSTS off for local HTTP while preserving document policy", () => {
    const headers = documentSecurityHeaders({ https: false });
    expect(headers["strict-transport-security"]).toBeUndefined();
    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    expect(headers["permissions-policy"]).toContain("camera=()");
  });
});
