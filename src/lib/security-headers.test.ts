import { describe, expect, it } from "vitest";
import {
  baseSecurityHeaders,
  buildContentSecurityPolicy,
  documentSecurityHeaders,
  generateCspNonce,
  withSecurityHeaders,
} from "./security-headers";

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

  it("replaces script 'unsafe-inline' with the request nonce and keeps the host allowlist", () => {
    const nonce = generateCspNonce();
    const csp = buildContentSecurityPolicy(nonce);
    const script = csp.split("; ").find((d) => d.startsWith("script-src ")) ?? "";
    expect(script).toContain(`'nonce-${nonce}'`);
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("strict-dynamic");
    for (const host of [
      "https://js.stripe.com",
      "https://www.googletagmanager.com",
      "https://pagead2.googlesyndication.com",
      "https://googleads.g.doubleclick.net",
    ]) {
      expect(script).toContain(host);
    }
    expect(csp).toContain("script-src-attr 'none'");
  });

  it("falls back to 'unsafe-inline' only when no nonce exists", () => {
    const script = buildContentSecurityPolicy().split("; ").find((d) => d.startsWith("script-src ")) ?? "";
    expect(script).toContain("'unsafe-inline'");
  });

  it("generates a different unguessable nonce each time", () => {
    const a = generateCspNonce();
    const b = generateCspNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });

  it("puts the nonce policy and a private cache-control on HTML, and leaves other responses alone", () => {
    const html = withSecurityHeaders(new Response("<p/>", { headers: { "content-type": "text/html" } }), {
      https: true,
      nonce: "abc",
    });
    expect(html.headers.get("content-security-policy")).toContain("'nonce-abc'");
    expect(html.headers.get("cache-control")).toBe("private, no-cache");
    const json = withSecurityHeaders(new Response("{}", { headers: { "content-type": "application/json" } }), {
      https: true,
      nonce: "abc",
    });
    expect(json.headers.get("content-security-policy")).toBeNull();
    expect(json.headers.get("cache-control")).toBeNull();
  });

  it("never overwrites a CSP or cache-control a handler set on purpose", () => {
    const res = withSecurityHeaders(
      new Response("x", {
        headers: { "content-type": "text/html", "content-security-policy": "default-src 'none'", "cache-control": "no-store" },
      }),
      { https: true, nonce: "abc" },
    );
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
