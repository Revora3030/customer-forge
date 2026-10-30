import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalPath, trailingSlashRedirect } from "./trailing-slash-redirect";

const BASE = "https://revoragrowthsystems.com";
const get = (path: string, method = "GET") => new Request(BASE + path, { method });

describe("trailing-slash canonical redirect", () => {
  it("308s a page with a trailing slash to the no-slash path", () => {
    const res = trailingSlashRedirect(get("/pricing/"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe("/pricing");
  });

  it("keeps the query string", () => {
    const res = trailingSlashRedirect(get("/s/elite-mobile-detail/?utm_source=x&ref=1"));
    expect(res?.headers.get("location")).toBe("/s/elite-mobile-detail?utm_source=x&ref=1");
  });

  it("redirects HEAD the same way", () => {
    expect(trailingSlashRedirect(get("/about/", "HEAD"))?.status).toBe(308);
  });

  it("never redirects the root", () => {
    expect(trailingSlashRedirect(get("/"))).toBeNull();
    expect(trailingSlashRedirect(get("/?x=1"))).toBeNull();
  });

  it("leaves canonical paths alone", () => {
    expect(trailingSlashRedirect(get("/pricing"))).toBeNull();
    expect(trailingSlashRedirect(get("/pricing?x=1"))).toBeNull();
  });

  it("does not touch API, server-function or Lovable paths", () => {
    expect(trailingSlashRedirect(get("/api/public/agent/health/"))).toBeNull();
    expect(trailingSlashRedirect(get("/api/"))).toBeNull();
    expect(trailingSlashRedirect(get("/_serverFn/abc/"))).toBeNull();
    expect(trailingSlashRedirect(get("/lovable/email/"))).toBeNull();
  });

  it("never bounces a POST or other non-GET request", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      expect(trailingSlashRedirect(get("/get-started/", method))).toBeNull();
    }
  });

  it("collapses repeated slashes and cannot become an open redirect", () => {
    expect(trailingSlashRedirect(get("/pricing///"))?.headers.get("location")).toBe("/pricing");
    const res = trailingSlashRedirect(get("//evil.example/"));
    expect(res?.headers.get("location")).toBe("/evil.example");
    expect(canonicalPath("//")).toBe("/");
  });

  it("is wired into the request middleware after the https and traffic-domain redirects", () => {
    const start = readFileSync(new URL("../start.ts", import.meta.url), "utf8");
    expect(start).toMatch(
      /httpsRedirectMiddleware,\s*trafficDomainRedirect,\s*trailingSlashMiddleware,/,
    );
  });
});
