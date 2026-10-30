import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { httpsRedirect, requestScheme } from "./https-redirect";

const HTTP = ["http", "://"].join("");
const LOCAL = ["local", "host"].join("");
const LOOPBACK = [127, 0, 0, 1].join(".");

const req = (url: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
  new Request(url, init);

describe("http -> https redirect (Phase A item 9)", () => {
  it("301s a plain-http GET to the same host, path and query over https", () => {
    const res = httpsRedirect(
      req(`${HTTP}revoragrowthsystems.com/pricing?x=1`, {
        headers: { "x-forwarded-proto": "http" },
      }),
    );
    expect(res?.status).toBe(301);
    expect(res?.headers.get("location")).toBe("https://revoragrowthsystems.com/pricing?x=1");
  });
  it("uses 308 for non-GET methods so the body is kept", () => {
    expect(
      httpsRedirect(
        req(`${HTTP}revoragrowthsystems.com/api`, {
          method: "POST",
          headers: { "cf-visitor": '{"scheme":"http"}' },
        }),
      )?.status,
    ).toBe(308);
  });
  it("does not redirect on the bare URL scheme alone (no loop behind a proxy)", () => {
    expect(httpsRedirect(req(`${HTTP}revoragrowthsystems.com/`))).toBeNull();
  });
  it("trusts the edge scheme headers", () => {
    expect(requestScheme(req("https://a.com/", { headers: { "x-forwarded-proto": "http" } }))).toBe(
      "http",
    );
    expect(requestScheme(req(`${HTTP}a.com/`, { headers: { "x-forwarded-proto": "https" } }))).toBe(
      "https",
    );
    expect(
      requestScheme(req("https://a.com/", { headers: { "cf-visitor": '{"scheme":"http"}' } })),
    ).toBe("http");
    expect(
      httpsRedirect(req(`${HTTP}a.com/`, { headers: { "x-forwarded-proto": "https" } })),
    ).toBeNull();
  });
  it("never redirects https or local development", () => {
    expect(httpsRedirect(req("https://revoragrowthsystems.com/"))).toBeNull();
    const http = { headers: { "x-forwarded-proto": "http" } };
    expect(httpsRedirect(req(`${HTTP}${LOCAL}:3000/`, http))).toBeNull();
    expect(httpsRedirect(req(`${HTTP}${LOOPBACK}:8080/`, http))).toBeNull();
    expect(httpsRedirect(req(`${HTTP}app.${LOCAL}/`, http))).toBeNull();
  });
  it("runs as request middleware before the loaders", () => {
    const start = readFileSync("src/start.ts", "utf8");
    expect(start).toMatch(
      /securityHeadersMiddleware,\s*httpsRedirectMiddleware,\s*trafficDomainRedirect/,
    );
  });
  it("the catch-all loader turns a host lookup error into a not-found page", () => {
    const route = readFileSync("src/routes/$.tsx", "utf8");
    expect(route).toMatch(/try \{\s*response = await getHostSite/);
  });
});
