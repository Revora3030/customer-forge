import { describe, it, expect } from "vitest";
import {
  CONTENT_SECURITY_POLICY,
  baseSecurityHeaders,
  documentSecurityHeaders,
  withSecurityHeaders,
} from "@/lib/security-headers";
import {
  REVORA_ROOT,
  SITE_ROOT,
  isTrafficDomainHost,
  trafficRedirectUrl,
  canonicalSiteUrl,
  isRevoraOwnHost,
  isPossibleTenantHost,
  normalizeHost,
} from "@/lib/revora-address";
import worker from "../../cloudflare/worker.js";

describe("security headers", () => {
  it("locks down executable sources while allowing the real integrations", () => {
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    // Same-origin framing only: other origins still cannot frame Revora.
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'self'");
    expect(CONTENT_SECURITY_POLICY).not.toContain("frame-ancestors *");
    expect(CONTENT_SECURITY_POLICY).toContain("https://js.stripe.com");
    expect(CONTENT_SECURITY_POLICY).toContain("wss://*.supabase.co");
    expect(CONTENT_SECURITY_POLICY).toContain("https://fonts.gstatic.com");
    // No blanket wildcard for code execution or data exfiltration targets.
    expect(CONTENT_SECURITY_POLICY).not.toContain("script-src *");
    expect(CONTENT_SECURITY_POLICY).not.toContain("connect-src *");
  });

  it("only sends HSTS over https", () => {
    expect(baseSecurityHeaders({ https: true })["strict-transport-security"]).toContain("max-age=");
    expect(baseSecurityHeaders({ https: false })["strict-transport-security"]).toBeUndefined();
    expect(documentSecurityHeaders({ https: true })["content-security-policy"]).toBe(
      CONTENT_SECURITY_POLICY,
    );
  });

  it("adds document headers to html and never overwrites a deliberate header", () => {
    const html = withSecurityHeaders(
      new Response("<html></html>", {
        headers: { "content-type": "text/html; charset=utf-8", "referrer-policy": "no-referrer" },
      }),
      { https: true },
    );
    expect(html.headers.get("content-security-policy")).toBeTruthy();
    expect(html.headers.get("x-content-type-options")).toBe("nosniff");
    expect(html.headers.get("referrer-policy")).toBe("no-referrer");

    const json = withSecurityHeaders(
      new Response("{}", { headers: { "content-type": "application/json" } }),
      { https: true },
    );
    expect(json.headers.get("x-content-type-options")).toBe("nosniff");
    expect(json.headers.get("content-security-policy")).toBeNull();
  });
});

describe("hostname resolution edge cases", () => {
  it("normalises spoofing-shaped hosts", () => {
    expect(normalizeHost("Business.RevoraWeb.Site.")).toBe("business.revoraweb.site");
    expect(normalizeHost("business.revoraweb.site:443")).toBe("business.revoraweb.site");
    expect(normalizeHost(null)).toBe("");
  });

  it("never treats the platform domain or a preview host as a client", () => {
    for (const host of [
      REVORA_ROOT,
      `www.${REVORA_ROOT}`,
      SITE_ROOT,
      `www.${SITE_ROOT}`,
      "localhost:8080",
      "id-preview--x.lovable.app",
    ]) {
      expect(isRevoraOwnHost(host), host).toBe(true);
    }
    expect(isRevoraOwnHost(`business.${SITE_ROOT}`)).toBe(false);
  });

  it("never resolves a traffic-domain host to a client website", () => {
    for (const host of [
      `business.${SITE_ROOT}`,
      `BUSINESS.${SITE_ROOT}.`,
      `a.b.${SITE_ROOT}`,
      SITE_ROOT,
      `www.${SITE_ROOT}`,
    ]) {
      expect(isPossibleTenantHost(host), host).toBe(false);
    }
  });

  it("still resolves a real customer-owned domain as a candidate tenant host", () => {
    expect(isPossibleTenantHost("millerroofing.com")).toBe(true);
    expect(isPossibleTenantHost(`evil${SITE_ROOT}`)).toBe(true);
  });
});

describe("client website canonical urls", () => {
  const verifiedDomain = {
    custom_domain: "millerroofing.com",
    dns_ok: true,
    ssl_ok: true,
  };

  it("uses the client's own verified domain, never Revora's platform domain", () => {
    expect(canonicalSiteUrl(verifiedDomain, "miller", "home")).toBe("https://millerroofing.com");
    expect(canonicalSiteUrl(verifiedDomain, "miller", "services")).toBe(
      "https://millerroofing.com/services",
    );
    expect(canonicalSiteUrl(verifiedDomain, "miller", "services")).not.toContain(REVORA_ROOT);
  });

  it("falls back to the always-working platform path only when nothing is verified", () => {
    const unverified = { custom_domain: "millerroofing.com", dns_ok: false, ssl_ok: false };
    expect(canonicalSiteUrl(unverified, "miller", "home")).toBe(`https://${REVORA_ROOT}/s/miller`);
    expect(canonicalSiteUrl(unverified, "miller", "about")).toBe(
      `https://${REVORA_ROOT}/s/miller/about`,
    );
  });

  it("honours an explicit https canonical the client set", () => {
    expect(canonicalSiteUrl(verifiedDomain, "miller", "home", "https://chosen.example/x")).toBe(
      "https://chosen.example/x",
    );
    // A non-https value can never override the computed canonical.
    expect(canonicalSiteUrl(verifiedDomain, "miller", "home", "javascript:alert(1)")).toBe(
      "https://millerroofing.com",
    );
  });
});

describe("cloudflare traffic-domain worker", () => {
  const call = (url: string, init?: RequestInit) => worker.fetch(new Request(url, init));

  it("refuses every host except the traffic domain and its www form", async () => {
    for (const url of [
      `https://business.${SITE_ROOT}/`,
      `https://a.b.${SITE_ROOT}/`,
      `https://evil${SITE_ROOT}/`,
      `https://-bad.${SITE_ROOT}/`,
      "https://attacker.com/",
    ]) {
      const res = await call(url);
      expect(res.status, url).toBe(404);
    }
  });

  it("redirects non-idempotent methods without losing the target", async () => {
    // Worker-shaped request: the runtime passes methods `Request` may reject.
    const res = await worker.fetch({
      method: "POST",
      url: `https://${SITE_ROOT}/pricing`,
      headers: new Headers(),
    } as unknown as Request);
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("https://revoragrowthsystems.com/pricing");
  });
});

describe("revoraweb.site is a traffic-only redirect domain", () => {
  it("recognises every form of the traffic domain", () => {
    for (const host of [
      SITE_ROOT,
      `www.${SITE_ROOT}`,
      `business.${SITE_ROOT}`,
      `BUSINESS.${SITE_ROOT}.`,
      `business.${SITE_ROOT}:443`,
    ]) {
      expect(isTrafficDomainHost(host)).toBe(true);
    }
    // The platform domain and look-alikes are never the traffic domain, so the
    // redirect can never loop or capture unrelated hosts.
    for (const host of ["revoragrowthsystems.com", `evil${SITE_ROOT}`, "example.com", ""]) {
      expect(isTrafficDomainHost(host)).toBe(false);
    }
  });

  it("redirects apex, www and marketing paths to the platform domain", () => {
    expect(trafficRedirectUrl("/")).toBe("https://revoragrowthsystems.com/");
    expect(trafficRedirectUrl("/pricing")).toBe("https://revoragrowthsystems.com/pricing");
    expect(trafficRedirectUrl("/contact")).toBe("https://revoragrowthsystems.com/contact");
    expect(trafficRedirectUrl("/about")).toBe("https://revoragrowthsystems.com/about");
  });

  it("cannot be turned into an open redirect", () => {
    for (const attempt of [
      ["/", "?redirect=https://example.com"],
      ["/", "?next=//evil.tld"],
      ["//evil.tld/path", ""],
    ] as const) {
      const url = trafficRedirectUrl(attempt[0], attempt[1]);
      expect(new URL(url).origin).toBe("https://revoragrowthsystems.com");
    }
  });

  it("has no query parameter that can bypass the traffic redirect", async () => {
    const { isTrafficDomainHost } = await import("@/lib/revora-address");
    // The old `_rw` marker is gone: the decision to redirect depends on the host
    // alone, so no visitor-supplied query string can reach the application on
    // the traffic domain.
    expect(isTrafficDomainHost(`${SITE_ROOT}`)).toBe(true);
    expect(trafficRedirectUrl("/pricing", "?_rw=1")).toBe(
      "https://revoragrowthsystems.com/pricing?_rw=1",
    );
    const source = await import("node:fs").then((fs) => fs.readFileSync("src/start.ts", "utf8"));
    expect(source).not.toContain("_rw");
    expect(source).not.toContain("TRAFFIC_REDIRECT_MARKER");
  });

  it("keeps Revora-branded client subdomain hosting switched off", async () => {
    const { REVORA_SUBDOMAIN_HOSTING_ENABLED } = await import("@/lib/revora-address");
    expect(REVORA_SUBDOMAIN_HOSTING_ENABLED).toBe(false);
  });

  it("worker redirects the traffic domain and refuses everything else", async () => {
    const worker = (await import("../../cloudflare/worker.js")).default;
    for (const url of [
      `https://${SITE_ROOT}/pricing?redirect=https://example.com`,
      `https://www.${SITE_ROOT}/about`,
    ]) {
      const res = await worker.fetch(new Request(url));
      expect(res.status).toBe(301);
      expect(new URL(res.headers.get("location")!).origin).toBe("https://revoragrowthsystems.com");
    }
    // A client subdomain must never be served as a website by the edge.
    for (const url of [`https://business.${SITE_ROOT}/`, `https://evil${SITE_ROOT}/`]) {
      expect((await worker.fetch(new Request(url))).status).toBe(404);
    }
  });
});
