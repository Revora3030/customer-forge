import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeIndexNowStatus, indexNowKey, indexNowPayload, indexNowRootKeyPath, sitemapLocs } from "@/lib/indexnow";

const KEY = "example-indexnow-value";

describe("IndexNow submissions for revoragrowthsystems.com", () => {
  it("only sends pages on Revora's own host, once each, with the published key file", () => {
    const payload = indexNowPayload(
      "https://revoragrowthsystems.com",
      [
        "https://revoragrowthsystems.com",
        "https://revoragrowthsystems.com/pricing",
        "https://revoragrowthsystems.com/pricing",
        "https://evil.example/pricing",
        "not a url",
      ],
      KEY,
    );
    expect(payload).toEqual({
      host: "revoragrowthsystems.com",
      key: KEY,
      keyLocation: "https://revoragrowthsystems.com/indexnow-key.txt",
      urlList: ["https://revoragrowthsystems.com", "https://revoragrowthsystems.com/pricing"],
    });
  });

  it("derives a stable key per host and honours a valid override", async () => {
    const derived = await indexNowKey("revoragrowthsystems.com");
    expect(derived).toMatch(/^[0-9a-f]{32}$/);
    expect(await indexNowKey("RevoraGrowthSystems.com")).toBe(derived);
    expect(await indexNowKey("other.example")).not.toBe(derived);
    expect(await indexNowKey("revoragrowthsystems.com", "abcdef12-3456")).toBe("abcdef12-3456");
    expect(await indexNowKey("revoragrowthsystems.com", "bad key!")).toBe(derived);
  });

  it("reports acceptance honestly", () => {
    expect(describeIndexNowStatus(202).ok).toBe(true);
    expect(describeIndexNowStatus(403).ok).toBe(false);
  });

  it("serves the key file and keeps the submit action super-admin only", () => {
    expect(readFileSync("src/routes/indexnow-key[.]txt.ts", "utf8")).toContain('await indexNowKey(host, process.env["INDEXNOW_KEY"])');
    expect(readFileSync("src/lib/indexnow.functions.ts", "utf8")).toContain("await assertSuperAdmin(context.supabase, context.userId);");
  });

  it("also serves the key at IndexNow's default /<key>.txt root location, only for the host's own key", async () => {
    const key = await indexNowKey("revoragrowthsystems.com");
    expect(indexNowRootKeyPath(key)).toBe(`/${key}.txt`);
    const route = readFileSync("src/routes/{$key}[.]txt.ts", "utf8");
    expect(route).toContain('createFileRoute("/{$key}.txt")');
    expect(route).toContain('await indexNowKey(host, process.env["INDEXNOW_KEY"])');
    expect(route).toContain("params.key !== key");
    expect(route).toContain("status: 404");
  });

  it("reads page and child-sitemap locations from live sitemap XML", () => {
    expect(
      sitemapLocs(
        `<?xml version="1.0"?><urlset><url><loc>https://revoragrowthsystems.com</loc></url>
        <url><loc> https://revoragrowthsystems.com/a?x=1&amp;y=2 </loc><lastmod>2026-10-29</lastmod></url></urlset>`,
      ),
    ).toEqual({ urls: ["https://revoragrowthsystems.com", "https://revoragrowthsystems.com/a?x=1&y=2"], sitemaps: [] });
    expect(
      sitemapLocs(`<sitemapindex><sitemap><loc>https://revoragrowthsystems.com/sitemaps/sites.xml</loc></sitemap></sitemapindex>`),
    ).toEqual({ urls: [], sitemaps: ["https://revoragrowthsystems.com/sitemaps/sites.xml"] });
  });
});
