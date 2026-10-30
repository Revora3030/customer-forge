import { describe, expect, it } from "vitest";
import { siteRequestTarget, siteUnavailableResponse } from "./site-unavailable";

const own = (host: string) => host === "revoragrowthsystems.com";
const req = (url: string, init: RequestInit & { host?: string } = {}) =>
  new Request(url, { ...init, headers: { host: init.host ?? new URL(url).host } });

describe("site unavailable page", () => {
  it("answers 410 Gone with noindex and no caching", async () => {
    const res = siteUnavailableResponse("GET");
    expect(res.status).toBe(410);
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    expect(html).toContain("This site is currently unavailable");
    expect(html).toContain('content="noindex, nofollow"');
    expect(html).not.toMatch(/revora/i);
    expect(await siteUnavailableResponse("HEAD").text()).toBe("");
  });

  it("only gates tenant page and sitemap requests", () => {
    expect(siteRequestTarget(req("https://revoragrowthsystems.com/s/acme-plumbing"), own)).toEqual({ kind: "slug", slug: "acme-plumbing" });
    expect(siteRequestTarget(req("https://revoragrowthsystems.com/s/acme-plumbing/sitemap.xml"), own)).toEqual({ kind: "slug", slug: "acme-plumbing" });
    expect(siteRequestTarget(req("https://revoragrowthsystems.com/pricing"), own)).toBeNull();
    expect(siteRequestTarget(req("https://revoragrowthsystems.com/s/acme", { method: "POST" }), own)).toBeNull();
    expect(siteRequestTarget(req("https://acmeplumbing.com/services"), own)).toEqual({ kind: "host", host: "acmeplumbing.com" });
    expect(siteRequestTarget(req("https://acmeplumbing.com/sitemap.xml"), own)).toEqual({ kind: "host", host: "acmeplumbing.com" });
    expect(siteRequestTarget(req("https://acmeplumbing.com/robots.txt"), own)).toBeNull();
    expect(siteRequestTarget(req("https://acmeplumbing.com/assets/app.js"), own)).toBeNull();
    expect(siteRequestTarget(req("https://acmeplumbing.com/logo.png"), own)).toBeNull();
    expect(siteRequestTarget(req("https://acmeplumbing.com/api/public/lead"), own)).toBeNull();
    expect(siteRequestTarget(req("https://acmeplumbing.com/_serverFn/abc"), own)).toBeNull();
  });
});
