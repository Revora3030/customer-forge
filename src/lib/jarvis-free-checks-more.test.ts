import { describe, expect, it } from "vitest";
import { summarizeRobots, summarizeSitemap, summarizeSeoTags, summarizeCrtsh, cleanPlaceQuery, summarizeNominatim } from "./jarvis-free-checks";

describe("new keyless checks", () => {
  it("flags robots that block every crawler", () => {
    expect(summarizeRobots("User-agent: *\nDisallow: /\nSitemap: https://a.com/s.xml").blocksAllCrawlers).toBe(true);
    expect(summarizeRobots("User-agent: bad\nDisallow: /\nUser-agent: *\nDisallow:").blocksAllCrawlers).toBe(false);
    expect(summarizeRobots(null).present).toBe(false);
  });
  it("counts sitemap urls", () => {
    expect(summarizeSitemap("<urlset><url><loc>a</loc></url><url><loc>b</loc></url></urlset>").urlCount).toBe(2);
  });
  it("lists missing social tags and structured data", () => {
    const s = summarizeSeoTags('<meta property="og:title" content="X"><script type="application/ld+json">{"@type":"Organization"}</script>');
    expect(s.structuredDataTypes).toEqual(["Organization"]);
    expect(s.missing).toContain("og:image");
    expect(s.missing).not.toContain("og:title");
  });
  it("keeps only the requested domain's hostnames and finds soonest-needed renewal", () => {
    const s = summarizeCrtsh([{ name_value: "a.com\nwww.a.com\nevil.com", issuer_name: "C=US, O=Let's Encrypt, CN=R3", not_after: "2026-11-01T00:00:00" }], "a.com", Date.parse("2026-10-22T00:00:00Z"));
    expect(s.hostnames).toEqual(["a.com", "www.a.com"]);
    expect(s.daysUntilLatestExpiry).toBe(10);
  });
  it("rejects tiny map queries and credits OpenStreetMap", () => {
    expect(cleanPlaceQuery("ab")).toBeNull();
    expect(summarizeNominatim([{ name: "Shop", display_name: "1 Main St", lat: "1", lon: "2" }]).attribution).toMatch(/OpenStreetMap/);
  });
});
