import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetIntegrationHealth } from "./registry.server";
import { PUBLIC_PAGE_MAX_TEXT, readPublicPage, researchPage } from "./research.server";

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
        if (new URL(url).hostname === "cloudflare-dns.com") {
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
        if (new URL(url).hostname === "cloudflare-dns.com") {
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
      if (new URL(url).hostname === "cloudflare-dns.com") {
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

describe("readPublicPage (keyless web.page.read)", () => {
  const dns = (url: string) =>
    Response.json({ Answer: url.includes("type=AAAA") ? [] : [{ type: 1, data: "93.184.216.34" }] });
  const page = (respond: () => Response) => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      return new URL(url).hostname === "cloudflare-dns.com" ? dns(url) : respond();
    }));
    return calls;
  };

  beforeEach(() => {
    resetIntegrationHealth();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("refuses http, private addresses and credentials without fetching them", async () => {
    const calls = page(() => new Response("never"));
    expect(await readPublicPage("http://example.com/")).toMatchObject({ ok: false, reason: "not_https" });
    expect(await readPublicPage("https://127.0.0.1/")).toMatchObject({ ok: false, reason: "unsafe_address" });
    expect(await readPublicPage("https://user:pass@example.com/")).toMatchObject({ ok: false, reason: "unsafe_address" });
    expect(calls.filter((url) => !url.includes("cloudflare-dns.com"))).toEqual([]);
  });

  it("reads only HTML or plain text", async () => {
    page(() => Response.json({ secret: "x" }));
    expect(await readPublicPage("https://example.com/data")).toMatchObject({ ok: false, reason: "not_html" });
  });

  it("reports a redirect with only the destination host and never follows it", async () => {
    const calls = page(() => new Response(null, { status: 302, headers: { location: "https://elsewhere.example.org/private?token=abc" } }));
    const outcome = await readPublicPage("https://example.com/");
    expect(outcome).toEqual({ ok: false, reason: "redirect", httpStatus: 302, locationHost: "elsewhere.example.org" });
    expect(JSON.stringify(outcome)).not.toContain("token");
    expect(calls.some((url) => url.includes("elsewhere.example.org"))).toBe(false);
  });

  it("caps the text and labels it as research from Revora's own reader", async () => {
    page(() => new Response(`<html><head><title>Guide</title></head><body><script>steal()</script>${"<p>word</p>".repeat(5000)}</body></html>`, {
      status: 200, headers: { "content-type": "text/html; charset=utf-8" },
    }));
    const outcome = await readPublicPage("https://example.com/guide");
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.extract.text.length).toBe(PUBLIC_PAGE_MAX_TEXT);
      expect(outcome.textTruncated).toBe(true);
      expect(outcome.extract.text).not.toMatch(/steal|<p>/);
      expect(outcome.extract.title).toBe("Guide");
      expect(outcome.extract.source).toMatchObject({ provider: "revora-native-fetch", trust: "research" });
    }
  });

  it("never calls Firecrawl, even when its key is set and paid providers are allowed", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test");
    vi.stubEnv("FREE_AI_ONLY", "false");
    const calls = page(() => new Response("<title>Plain</title><p>Hello</p>", { status: 200, headers: { "content-type": "text/html" } }));
    const outcome = await readPublicPage("https://example.com/");
    expect(outcome.ok).toBe(true);
    expect(calls.some((url) => url.includes("firecrawl"))).toBe(false);
  });
});
