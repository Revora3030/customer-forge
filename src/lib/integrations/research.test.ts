import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetIntegrationHealth } from "./registry.server";
import { researchPage } from "./research.server";

describe("capability-routed research", () => {
  beforeEach(() => {
    resetIntegrationHealth();
    delete process.env["FIRECRAWL_API_KEY"];
    process.env["FREE_AI_ONLY"] = "true";
    vi.restoreAllMocks();
  });

  it("reads a public page with Revora's own reader and keeps the source", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("cloudflare-dns.com")) {
          const isIpv6 = url.includes("type=AAAA");
          return Response.json({ Answer: isIpv6 ? [] : [{ type: 1, data: "93.184.216.34" }] });
        }
        return new Response(
          `<html><head><title>Acme Detailing</title><meta name="description" content="Mobile detailing"></head><body><h1>Acme</h1><p>We detail cars.</p></body></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }),
    );
    const outcome = await researchPage("https://example.com/");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.extract.title).toBe("Acme Detailing");
      expect(outcome.extract.source.provider).toBe("revora-native-fetch");
      expect(outcome.extract.source.url).toBe("https://example.com/");
      // Research is never treated as a verified business fact.
      expect(outcome.extract.source.trust).toBe("research");
      expect(outcome.extract.source.fetchedAt).toMatch(/^\d{4}-/);
    }
  });

  it("keeps only the visible page text, dropping scripts and styles", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("cloudflare-dns.com")) {
          return Response.json({ Answer: url.includes("type=AAAA") ? [] : [{ type: 1, data: "93.184.216.34" }] });
        }
        return new Response(
          `<html><head><title>Acme</title><style>p{}</style ></head><body><h1>Acme</h1><p>Cars &amp; trucks</p><script>steal()</script\t>${"<p>more</p>".repeat(3000)}</body></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }),
    );
    const outcome = await researchPage("https://example.com/");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.extract.text.startsWith("Acme Acme Cars & trucks more more")).toBe(true);
      expect(outcome.extract.text).not.toMatch(/steal|p\{/);
      expect(outcome.extract.text.length).toBe(8_000);
    }
  });

  it("reports honestly instead of inventing content when the page fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("cloudflare-dns.com")) {
        return Response.json({ Answer: url.includes("type=AAAA") ? [] : [{ type: 1, data: "93.184.216.34" }] });
      }
      return new Response("no", { status: 500 });
    }));
    const outcome = await researchPage("https://example.com/");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.detail).toContain("couldn't be read");
  });

  it("refuses private and non-web addresses", async () => {
    const calls = vi.fn();
    vi.stubGlobal("fetch", calls);
    const outcome = await researchPage("http://127.0.0.1/admin");
    expect(outcome.ok).toBe(false);
    expect(calls).not.toHaveBeenCalled();
  });
});
