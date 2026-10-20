import { afterEach, describe, expect, it, vi } from "vitest";
import { auditPublicWebsite, validatePublicWebsiteUrl } from "@/lib/audit/website-audit";

describe("website audit URL validation", () => {
  it("normalises a bare public hostname", () => {
    expect(validatePublicWebsiteUrl("example.com").toString()).toBe("https://example.com/");
  });

  it("rejects localhost and private IPv4 literals", () => {
    expect(() => validatePublicWebsiteUrl("http://localhost:3000")).toThrow();
    expect(() => validatePublicWebsiteUrl("http://192.168.1.10")).toThrow();
    expect(() => validatePublicWebsiteUrl("http://127.0.0.1")).toThrow();
    expect(() => validatePublicWebsiteUrl("http://169.254.169.254/latest/meta-data")).toThrow();
    expect(() => validatePublicWebsiteUrl("http://[::1]")).toThrow();
    expect(() => validatePublicWebsiteUrl("http://metadata.google.internal")).toThrow();
  });

  it("rejects credentials in URLs", () => {
    const url = validatePublicWebsiteUrl("https://user:password@example.com");
    expect(url.username).toBe("");
    expect(url.password).toBe("");
  });
});

describe("website audit visible text", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads conversion and trust signals from visible text only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("cloudflare-dns.com")) {
          return Response.json({ Answer: url.includes("type=AAAA") ? [] : [{ type: 1, data: "93.184.216.34" }] });
        }
        return new Response(
          "<html><head><title>Acme</title></head><body><h1>Acme</h1><p>Book&nbsp;now</p>" +
            "<script>var t = 'reviews testimonials call now';</script ><noscript>Rated 5-star</noscript\n></body></html>",
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }),
    );
    const result = await auditPublicWebsite("https://example.com/");
    expect(result.signals.ctaSignals).toBe(1);
    expect(result.signals.socialProofSignals).toBe(0);
    expect(result.signals.phoneSignals).toBe(0);
  });
});
