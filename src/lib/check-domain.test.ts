import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const httpsStatus = { value: 200 };
vi.mock("@/lib/net-guard.server", () => ({
  isFetchableHostname: () => true,
  areAddressesPublic: () => true,
  guardedFetch: async () => ({ status: httpsStatus.value }),
}));

import { checkDomain, DOMAIN_A_RECORD } from "@/lib/admin.server";

type Zone = Record<string, { A?: string[]; CNAME?: string[]; TXT?: string[]; CAA?: string[] }>;

function mockDns(zone: Zone) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = new URL(url);
      const name = u.searchParams.get("name") ?? "";
      const type = u.searchParams.get("type") as "A" | "CNAME" | "AAAA" | "TXT" | "CAA";
      const values = zone[name]?.[type as "A" | "CNAME" | "TXT" | "CAA"] ?? [];
      const code = { A: 1, CNAME: 5, TXT: 16, CAA: 257, AAAA: 28 }[type] ?? 0;
      return {
        ok: true,
        json: async () => ({ Answer: values.map((data) => ({ type: code, data })) }),
      };
    }),
  );
}

describe("checkDomain", () => {
  beforeEach(() => {
    httpsStatus.value = 200;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is live when apex and www both point here and the site answers", async () => {
    mockDns({ "example.com": { A: [DOMAIN_A_RECORD] }, "www.example.com": { A: [DOMAIN_A_RECORD] } });
    const result = await checkDomain("example.com");
    expect(result.status).toBe("ssl_active");
    expect(result.records.wwwMatches).toBe(true);
    expect(result.detail).not.toMatch(/www\.example\.com isn't connected/);
  });

  it("warns when www is not connected", async () => {
    mockDns({ "example.com": { A: [DOMAIN_A_RECORD] } });
    const result = await checkDomain("example.com");
    expect(result.records.wwwMatches).toBe(false);
    expect(result.detail).toMatch(/www\.example\.com isn't connected/);
  });

  it("accepts a www CNAME to the apex", async () => {
    mockDns({ "example.com": { A: [DOMAIN_A_RECORD] }, "www.example.com": { CNAME: ["example.com."] } });
    const result = await checkDomain("example.com");
    expect(result.records.wwwMatches).toBe(true);
  });

  it.each([403, 404])("does not report a %s as live", async (status) => {
    httpsStatus.value = status;
    mockDns({ "example.com": { A: [DOMAIN_A_RECORD] }, "www.example.com": { A: [DOMAIN_A_RECORD] } });
    const result = await checkDomain("example.com");
    expect(result.status).toBe("connected");
    expect(result.records.servesThisSite).toBe(false);
    expect(result.sslOk).toBe(false);
    expect(result.detail).toContain(String(status));
  });

  it("does not check www for a www host", async () => {
    mockDns({ "www.example.com": { A: [DOMAIN_A_RECORD] } });
    const result = await checkDomain("www.example.com");
    expect(result.records.wwwMatches).toBeNull();
  });

  it("checks the _lovable TXT for both apex and www", async () => {
    mockDns({
      "example.com": { A: [DOMAIN_A_RECORD] },
      "www.example.com": { A: [DOMAIN_A_RECORD] },
      "_lovable.example.com": { TXT: ['"lovable_verify=abc"'] },
      "_lovable.www.example.com": { TXT: ['"lovable_verify=def"'] },
    });
    const result = await checkDomain("example.com");
    expect(result.records.txtVerified).toBe(true);
    expect(result.records.wwwTxtVerified).toBe(true);
  });

  it("warns when CAA records allow neither Let's Encrypt nor Google Trust Services", async () => {
    httpsStatus.value = 200;
    mockDns({
      "example.com": { A: [DOMAIN_A_RECORD], CAA: ['0 issue "digicert.com"'] },
      "www.example.com": { A: [DOMAIN_A_RECORD] },
    });
    const result = await checkDomain("example.com");
    expect(result.records.caaOk).toBe(false);
    expect(result.records.caaWarning).toMatch(/digicert\.com/);
    expect(result.detail).toMatch(/CAA/);
  });

  it("does not warn when CAA allows Let's Encrypt", async () => {
    mockDns({
      "example.com": { A: [DOMAIN_A_RECORD], CAA: ['0 issue "letsencrypt.org"'] },
      "www.example.com": { A: [DOMAIN_A_RECORD] },
    });
    const result = await checkDomain("example.com");
    expect(result.records.caaOk).toBe(true);
    expect(result.detail).not.toMatch(/CAA/);
  });

  it("tells Cloudflare users to use DNS-only records, never proxied @ and *", async () => {
    mockDns({ "example.com": { A: ["104.21.0.1"] } });
    const result = await checkDomain("example.com");
    expect(result.dnsOk).toBe(false);
    expect(result.detail).toMatch(/DNS only \(grey cloud\)/);
    expect(result.detail).not.toMatch(/proxied A records for @ and \*/);
  });
});
