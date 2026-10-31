import { describe, expect, it } from "vitest";
import { baseSecurityHeaders, documentSecurityHeaders } from "./security-headers";

describe("security headers", () => {
  it("allows only the required Google stylesheet and font hosts for platform fonts", () => {
    const csp = documentSecurityHeaders({ https: true })["content-security-policy"];
    expect(csp).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(csp).toContain("font-src 'self' data: https://fonts.gstatic.com");
  });
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

  it("lets GA4 reach its own collection hosts so analytics isn't blocked on every page", () => {
    const csp = documentSecurityHeaders({ https: true })["content-security-policy"] ?? "";
    const connect =
      csp
        .split(";")
        .map((d) => d.trim())
        .find((d) => d.startsWith("connect-src")) ?? "";
    for (const host of [
      "https://www.google-analytics.com",
      "https://*.google-analytics.com",
      "https://analytics.google.com",
      "https://*.analytics.google.com",
      "https://stats.g.doubleclick.net",
      "https://www.googletagmanager.com",
    ]) {
      expect(connect.split(/\s+/)).toContain(host);
    }
    // Still no blanket wildcard.
    expect(connect.split(/\s+/)).not.toContain("https:");
    expect(connect.split(/\s+/)).not.toContain("*");
  });

  it("lets Microsoft Clarity load its tag and send data, without a blanket wildcard", () => {
    const csp = documentSecurityHeaders({ https: true })["content-security-policy"] ?? "";
    const directive = (name: string) =>
      (csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(name)) ?? "").split(/\s+/);
    expect(directive("script-src")).toContain("https://www.clarity.ms");
    expect(directive("connect-src")).toContain("https://*.clarity.ms");
    expect(directive("script-src")).not.toContain("https:");
  });

  it("allows Photon address suggestions but not Nominatim", () => {
    const csp = documentSecurityHeaders({ https: true })["content-security-policy"] ?? "";
    const connect =
      csp
        .split(";")
        .map((d) => d.trim())
        .find((d) => d.startsWith("connect-src")) ?? "";
    expect(connect.split(/\s+/)).toContain("https://photon.komoot.io");
    expect(connect).not.toContain("nominatim");
  });
});
