import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const httpsStatus = { value: 200 };
vi.mock("@/lib/net-guard.server", () => ({
  isFetchableHostname: () => true,
  areAddressesPublic: () => true,
  guardedFetch: async () => ({ status: httpsStatus.value }),
}));

import { checkDomain, DOMAIN_A_RECORD } from "@/lib/admin.server";

type Zone = Record<string, { A?: string[]; CNAME?: string[] }>;

function mockDns(zone: Zone) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = new URL(url);
      const name = u.searchParams.get("name") ?? "";
      const type = u.searchParams.get("type") as "A" | "CNAME" | "AAAA" | "TXT";
      const values = zone[name]?.[type as "A" | "CNAME"] ?? [];
      const code = type === "A" ? 1 : type === "CNAME" ? 5 : 0;
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
});
