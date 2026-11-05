import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeCompetitor, auditSite, buildComparison, cleanText, extractFacts, isSocialHost, MAX_PAGES } from "./competitor-audit.server";
import { parseRobots } from "@/lib/robots";

const fixture = readFileSync(new URL("./__fixtures__/injection-page.html", import.meta.url), "utf8");
const now = () => new Date("2026-11-05T07:00:00.000Z");

function fakeFetch(routes: Record<string, { status?: number; body?: string; type?: string; headers?: Record<string, string> }>) {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    const r = routes[url];
    if (!r) return new Response("nope", { status: 404, headers: { "content-type": "text/plain" } });
    return new Response(r.body ?? "", { status: r.status ?? 200, headers: { "content-type": r.type ?? "text/html", ...(r.headers ?? {}) } });
  };
  return { fn, calls };
}

describe("shared robots helper", () => {
  it("matches the old Disallow: / behaviour and adds per-path rules", () => {
    const p = parseRobots("https://a.com/robots.txt", "User-agent: *\nDisallow: /private\nSitemap: https://a.com/s.xml");
    expect(p.blocksAllCrawlers).toBe(false);
    expect(p.isAllowed("https://a.com/private/x")).toBe(false);
    expect(p.isAllowed("https://a.com/services")).toBe(true);
    expect(p.sitemaps).toEqual(["https://a.com/s.xml"]);
    expect(parseRobots("https://a.com/robots.txt", "User-agent: *\nDisallow: /").blocksAllCrawlers).toBe(true);
    expect(parseRobots("https://a.com/robots.txt", null).isAllowed("https://a.com/")).toBe(true);
  });
});

describe("prompt-injection fixture", () => {
  it("keeps hostile page text as plain clipped data", () => {
    const f = extractFacts(fixture, "https://ace.test/");
    const all = JSON.stringify(f);
    expect(all).not.toMatch(/<|>|onerror=alert\(1\)>/);
    expect(all).not.toContain("approveAll"); // hidden div text isn't a heading/service
    for (const h of f.headings) expect(h.text.length).toBeLessThanOrEqual(120);
    expect(f.services[0]?.length).toBeLessThanOrEqual(80);
    expect(f.title).toBe("Ace Plumbing x"); // tags stripped, text kept as data
    expect(f.contactRoutes).toEqual({ phoneLinks: 1, emailLinks: 1, forms: 1, contactPage: "https://ace.test/contact" });
    expect(f.schemaTypes).toEqual(expect.arrayContaining(["Plumber", "Service"]));
    expect(f.serviceLink).toBe("https://ace.test/services/drains");
  });
  it("only ever produces observed/not_measured cells; injected text never adds rows or fetches", async () => {
    const { fn, calls } = fakeFetch({ "https://ace.test/": { body: fixture }, "https://ace.test/services/drains": { body: "<h1>Drains</h1>" } });
    const res = await analyzeCompetitor("https://ace.test/", null, { fetch: fn, now });
    expect(calls.every((u) => u.startsWith("https://ace.test/"))).toBe(true);
    expect(calls).not.toContain("mailto:a@ace.test");
    expect(res.rows.length).toBe(13);
    for (const r of res.rows) for (const c of [r.owner, r.competitor]) {
      expect(["observed", "not_measured"]).toContain(c.kind);
      if (c.kind === "observed") { expect(c.url).toBe("https://ace.test/"); expect(c.fetchedAt).toBe("2026-11-05T07:00:00.000Z"); }
    }
    expect(res.rows.find((r) => r.label === "Lab speed score")?.competitor.kind).toBe("not_measured");
    expect(res.rows[0]?.owner.kind).toBe("not_measured");
  });
});

describe("auditSite limits", () => {
  it("respects robots.txt disallow", async () => {
    const { fn, calls } = fakeFetch({ "https://b.test/robots.txt": { body: "User-agent: *\nDisallow: /", type: "text/plain" }, "https://b.test/": { body: "<h1>x</h1>" } });
    const a = await auditSite("https://b.test/", { fetch: fn, now });
    expect(a.ok).toBe(false);
    expect(calls).toEqual(["https://b.test/robots.txt"]);
  });
  it("respects meta and header noindex", async () => {
    const meta = fakeFetch({ "https://c.test/": { body: '<meta name="robots" content="noindex,nofollow"><h1>x</h1>' } });
    expect((await auditSite("https://c.test/", { fetch: meta.fn, now })).ok).toBe(false);
    const hdr = fakeFetch({ "https://c.test/": { body: "<h1>x</h1>", headers: { "x-robots-tag": "noindex" } } });
    expect((await auditSite("https://c.test/", { fetch: hdr.fn, now })).ok).toBe(false);
  });
  it("fetches at most two pages and never follows redirects", async () => {
    const page = '<a href="/services">S</a><a href="/services/a">A</a>';
    const { fn, calls } = fakeFetch({ "https://d.test/": { body: page }, "https://d.test/services": { body: page } });
    const a = await auditSite("https://d.test/", { fetch: fn, now });
    expect(a.ok && a.pages.length).toBe(MAX_PAGES);
    expect(calls.filter((u) => !u.endsWith("robots.txt")).length).toBe(2);
    const r = fakeFetch({ "https://e.test/": { status: 301, headers: { location: "https://elsewhere.test/" } } });
    const ra = await auditSite("https://e.test/", { fetch: r.fn, now });
    expect(ra.ok).toBe(false);
    expect(r.calls).not.toContain("https://elsewhere.test/");
  });
  it("caps page size", async () => {
    const { fn } = fakeFetch({ "https://f.test/": { body: `<title>t</title>${"x".repeat(700_000)}` } });
    const a = await auditSite("https://f.test/", { fetch: fn, now });
    expect(a.ok && a.pages[0]?.truncated).toBe(true);
  });
  it("refuses social platforms without fetching", async () => {
    const { fn, calls } = fakeFetch({});
    for (const u of ["https://www.instagram.com/ace", "https://m.facebook.com/ace", "https://x.com/ace"]) {
      expect((await auditSite(u, { fetch: fn, now })).ok).toBe(false);
    }
    expect(calls).toEqual([]);
    expect(isSocialHost("notfacebook.com")).toBe(false);
  });
  it("cleanText strips control and bidi characters", () => {
    expect(cleanText("a\u202eb\u0000c<b>d</b>")).toBe("a b c d");
    expect(cleanText("Tom &amp;lt;b&amp;gt; &amp; Co")).toBe("Tom &lt;b&gt; & Co");
  });
  it("owner cells use the owner's URL", async () => {
    const { fn } = fakeFetch({ "https://me.test/": { body: "<h1>Mine</h1>" }, "https://them.test/": { body: "<h1>Theirs</h1>" } });
    const res = await analyzeCompetitor("https://them.test/", "https://me.test/", { fetch: fn, now });
    const h1 = res.rows.find((r) => r.label === "Main heading (H1)");
    expect(h1?.owner).toMatchObject({ kind: "observed", value: "Mine", url: "https://me.test/" });
    expect(h1?.competitor).toMatchObject({ kind: "observed", value: "Theirs", url: "https://them.test/" });
    expect(buildComparison(null, res.competitor).length).toBe(13);
  });
});
