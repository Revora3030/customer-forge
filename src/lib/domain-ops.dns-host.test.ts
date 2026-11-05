import { afterEach, describe, expect, it, vi } from "vitest";
import { detectDomainDnsHost, domainLiveCheckLimiter, dnsHostLookupLimiter } from "@/lib/domain-ops.server";

const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as unknown as Response;
const ns = (...hosts: string[]) => ({ Answer: hosts.map((data) => ({ name: "x.", type: 2, data })) });

afterEach(() => vi.unstubAllGlobals());

describe("detectDomainDnsHost", () => {
  it("uses Cloudflare DoH first and detects the host", async () => {
    const fetchMock = vi.fn(async (_url: string) => json(ns("anna.ns.cloudflare.com.", "bob.ns.cloudflare.com.")));
    vi.stubGlobal("fetch", fetchMock);
    const result = await detectDomainDnsHost("example.com");
    expect(result).toMatchObject({ state: "detected", guideId: "cloudflare" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("cloudflare-dns.com");
  });

  it("falls back to Google DoH when Cloudflare fails", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("cloudflare") ? json({}, false) : json(ns("ns57.domaincontrol.com.")),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await detectDomainDnsHost("example.com")).toMatchObject({ state: "detected", guideId: "godaddy" });
  });

  it("says unknown when both resolvers fail", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({}, false)));
    expect(await detectDomainDnsHost("example.com")).toMatchObject({ state: "unknown" });
  });
});

describe("server rate limits", () => {
  it("allow 12 live checks and 6 host lookups per minute per key, then refuse", () => {
    const t = 1_000;
    for (let i = 0; i < 12; i += 1) expect(domainLiveCheckLimiter.hit("k", t)).toBe(true);
    expect(domainLiveCheckLimiter.hit("k", t)).toBe(false);
    for (let i = 0; i < 6; i += 1) expect(dnsHostLookupLimiter.hit("k", t)).toBe(true);
    expect(dnsHostLookupLimiter.hit("k", t)).toBe(false);
    expect(domainLiveCheckLimiter.hit("k", t + 61_000)).toBe(true);
  });
});
