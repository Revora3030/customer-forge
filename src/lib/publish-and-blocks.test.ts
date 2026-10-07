import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { evaluateSmoke, previousProduction, smokePaths } from "@/lib/publish-smoke";
import { purgeEdgeCache, purgeUrls } from "@/lib/edge-cache.server";
import { stickyActions } from "@/components/site/site-sections-utils";

const page = (body: string) =>
  `<html><head><title>Acme Detailing</title><link rel="stylesheet" href="/a.css"></head><body>${body}${"x".repeat(600)}</body></html>`;

describe("post-publish smoke check", () => {
  it("tests home plus every visible page, skipping hidden and thank-you pages", () => {
    expect(
      smokePaths([
        { slug: "home" },
        { slug: "services" },
        { slug: "secret", hidden: true },
        { slug: "thanks", kind: "thanks" },
        { slug: "bad slug!" },
        { slug: "contact" },
      ]),
    ).toEqual(["/", "/services", "/contact"]);
    expect(smokePaths(Array.from({ length: 20 }, (_, i) => ({ slug: `p${i}` }))).length).toBe(8);
  });

  it("fails a page with no title or no stylesheet", () => {
    const ok = evaluateSmoke([{ path: "/", status: 200, contentType: "text/html", body: page("Acme Detailing"), ms: 10 }], { businessName: "Acme Detailing" });
    expect(ok.status).toBe("passed");
    const noTitle = evaluateSmoke([{ path: "/x", status: 200, contentType: "text/html", body: `<html><head></head><body>${"x".repeat(600)}</body></html>`, ms: 1 }]);
    expect(noTitle.checks[0]?.problem).toBe("page has no title");
    const noCss = evaluateSmoke([{ path: "/x", status: 200, contentType: "text/html", body: `<title>Hi there</title>${"x".repeat(600)}`, ms: 1 }]);
    expect(noCss.checks[0]?.problem).toBe("page has no stylesheet");
  });
});

describe("revert live site", () => {
  it("picks the newest earlier live snapshot", () => {
    const rows = [
      { version: 9, published_at: "t", live: true },
      { version: 8, published_at: null, live: false },
      { version: 7, published_at: "t", live: false },
      { version: 6, published_at: "t", live: true },
      { version: 3, published_at: "t", live: true },
    ];
    expect(previousProduction(rows, 9)?.version).toBe(6);
    expect(previousProduction([{ version: 2, published_at: "t", live: true }], 2)).toBeNull();
  });
});

describe("edge cache purge", () => {
  it("builds purge URLs for https sites only, capped at 30", () => {
    expect(purgeUrls("https://acme.com", ["/", "/services"])).toEqual([
      "https://acme.com",
      "https://acme.com/",
      "https://acme.com/services",
      "https://acme.com/sitemap.xml",
    ]);
    expect(purgeUrls("http://localhost:3000", ["/"])).toEqual([]);
    expect(purgeUrls("https://a.com", Array.from({ length: 50 }, (_, i) => `/p${i}`)).length).toBe(30);
  });

  it("is a no-op without Cloudflare credentials and never throws", async () => {
    const saved = { ...process.env };
    delete process.env["CLOUDFLARE_API_TOKEN"];
    delete process.env["CLOUDFLARE_CACHE_PURGE_TOKEN"];
    delete process.env["CLOUDFLARE_ZONE_ID"];
    await expect(purgeEdgeCache(["https://a.com"])).resolves.toEqual({ purged: 0, skipped: "not_configured" });
    process.env = saved;
  });
});

describe("phone sticky actions", () => {
  it("uses only verified facts", () => {
    expect(stickyActions({ phone: "(919) 555-0100", hasBookingPage: true, contactHref: "/book" })).toEqual([
      { label: "Call", href: "tel:9195550100", kind: "call" },
      { label: "Book now", href: "/book", kind: "book" },
    ]);
    expect(stickyActions({ phone: "123", hasQuote: true, contactHref: "/contact" })).toEqual([
      { label: "Get a quote", href: "/contact", kind: "quote" },
    ]);
    expect(stickyActions({ phone: null, contactHref: null })).toEqual([]);
  });
});
