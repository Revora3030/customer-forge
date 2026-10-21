import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeKeylessPage, KEYLESS_PAGE_TOOLS, MAX_HTML_BYTES, readKeylessPage } from "./jarvis-keyless-page";
import { executeJarvisDiagnosticTool } from "./jarvis-diagnostic-tools.server";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = "https://revoragrowthsystems.com/";
const html = `<html lang="en"><head><title>Revora</title><meta name="description" content="Growth"><meta name="viewport" content="width=device-width"><meta property="og:title" content="Revora"><meta property="og:description" content="Growth"><link rel="canonical" href="${url}"></head><body><h1 id="top">Revora</h1><label for="name">Name</label><input id="name"><label>Email<input type="email"></label><input aria-label="Phone"><button aria-label="Submit"></button><img alt=""><a href="#top">Top</a><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization"}</script></body></html>`;
const headers = { "content-type": "text/html", "strict-transport-security": "max-age=31536000", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'self'" };
afterEach(() => vi.unstubAllGlobals());
describe("No-key page diagnostics", () => {
  it("recognizes explicit, wrapping and ARIA labels and decorative images", () => {
    const report = analyzeKeylessPage(html, url, new Headers(headers));
    expect(report.accessibility.issues).toEqual([]);
    expect(report.links.brokenFragments).toBe(0);
    expect(report.seo.issues).toEqual([]);
    expect(report.security.issues).toEqual([]);
  });
  it("reports structural problems without executing scripts or external contexts", () => {
    const report = analyzeKeylessPage(`<html><h1 id="x">Title</h1><h3 id="x">Next</h3><input placeholder="Not a label"><button></button><img><script type="application/ld+json">invalid</script><a href="#missing">Missing</a><a href="javascript:alert(1)">Bad</a><a href="mailto:private@example.com">Mail</a></html>`, url);
    expect(report.accessibility).toMatchObject({ duplicateIds: 1, headingSkips: 1, unlabeledControls: 1, namelessButtons: 1, imagesMissingAlt: 1, invalidStructuredData: 1 });
    expect(report.links).toMatchObject({ brokenFragments: 1, unsafe: 1, contact: 1, destinationsFetched: 0 });
    expect(JSON.stringify(report)).not.toContain("private@example.com");
  });
  it("reads no keys and makes exactly one no-redirect read for each diagnostic", async () => {
    const fetchMock = vi.fn(async () => new Response(html, { headers }));
    vi.stubGlobal("fetch", fetchMock);
    for (const tool of KEYLESS_PAGE_TOOLS) {
      const result = await executeJarvisDiagnosticTool({} as SupabaseClient, tool);
      expect(result.status).toBe("observed");
      expect(result.data).toMatchObject({ evidenceType: "served_html", httpStatus: 200 });
      expect(JSON.stringify(result)).not.toContain("<html");
    }
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0]).toEqual([url, expect.objectContaining({ redirect: "manual", credentials: "omit" })]);
  });
  it("does not follow redirects or count failed reads as successful evidence", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await executeJarvisDiagnosticTool({} as SupabaseClient, "website.html.audit");
    expect(result.status).toBe("unknown");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.data).toMatchObject({ reason: "page_http_status", httpStatus: 302 });
  });
  it("rejects over-limit documents instead of passing truncated HTML", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x".repeat(MAX_HTML_BYTES + 1), { headers })));
    expect(await readKeylessPage(url)).toMatchObject({ reason: "html_limit_exceeded" });
  });
  it("rejects non-HTML responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { headers: { "content-type": "application/json" } })));
    expect(await readKeylessPage(url)).toMatchObject({ reason: "not_html" });
  });
  it("respects base URLs and decodes named fragment targets", () => {
    expect(analyzeKeylessPage('<base href="https://external.example/"><a href="#absent">Elsewhere</a>', url).links).toMatchObject({ external: 1, brokenFragments: 0 });
    expect(analyzeKeylessPage('<h1 id="a b">Title</h1><a href="#a%20b">Link</a>', url).links.brokenFragments).toBe(0);
  });
  it("detects header noindex and ignores title-like text in scripts", () => {
    const report = analyzeKeylessPage('<script>"<title>Fake</title>"</script>', url, new Headers({ "x-robots-tag": "noindex" }));
    expect(report.seo.titlePresent).toBe(false);
    expect(report.seo.noindex).toBe(true);
  });
});