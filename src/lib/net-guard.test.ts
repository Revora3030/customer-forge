import { afterEach, describe, it, expect, vi } from "vitest";
import { areAddressesPublic, guardedFetch, isFetchableHostname, isPublicAddress } from "@/lib/net-guard.server";
afterEach(() => vi.restoreAllMocks());
describe("ssrf guard", () => {
  it("rejects private and metadata hosts", () => {
    for (const h of [
      "localhost",
      "127.0.0.1",
      "169.254.169.254",
      "10.0.0.5",
      "192.168.1.1",
      "172.16.0.9",
      "[::1]",
      "metadata.google.internal",
      "0.0.0.0",
    ]) {
      expect(isFetchableHostname(h), h).toBe(false);
    }
    expect(isFetchableHostname("example.com")).toBe(true);
  });
  it("rejects non-http, credential and odd-port urls", async () => {
    for (const u of [
      "file:///etc/passwd",
      "http://example.com@169.254.169.254/",
      "https://example.com:8081/",
      "gopher://x",
    ]) {
      await expect(guardedFetch(u), u).rejects.toThrow();
    }
  });
  it.each([
    "8..8.8", "1.2.3.4.5", "198.18.0.1", "198.51.100.5", "203.0.113.5",
    "not:ipv6", "::", "::1", "0:0:0:0:0:0:0:1", "fd00::1", "fe80::1",
    "::ffff:7f00:1", "::ffff:a00:1", "::ffff:192.168.1.1", "::127.0.0.1", // DevSkim: ignore DS162092 -- Negative fixtures: mapped and compatible private addresses must be rejected.
    "2001:db8::1", "2002:7f00:1::1", "3fff::1", "2001::1",
  ])("blocks non-public or invalid address %s", (ip) => expect(isPublicAddress(ip)).toBe(false));

  it("allows public addresses, rejecting mixed public/private DNS records", () => {
    expect(areAddressesPublic(["8.8.8.8", "2606:4700:4700::1111", "::ffff:808:808"])).toBe(true);
    expect(areAddressesPublic(["8.8.8.8", "::ffff:7f00:1"])).toBe(false);
    expect(areAddressesPublic([])).toBe(false);
  });

  it("uses manual redirects even when a caller requests following", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 302 }));
    await guardedFetch("https://example.com", { redirect: "follow" }, async () => ["8.8.8.8"]);
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe("manual");
  });

  it("passes cancellation through DNS and never posts after cancellation", async () => {
    const abort = new AbortController();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      expect(init?.signal).toBeTruthy();
      abort.abort();
      init?.signal?.throwIfAborted();
      return Response.json({});
    });
    await expect(guardedFetch("https://example.com", { method: "POST", signal: abort.signal })).rejects.toThrow();
    expect(fetchMock.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
  });
});
