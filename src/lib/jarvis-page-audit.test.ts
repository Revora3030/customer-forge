import { describe, expect, it } from "vitest";
import { summarizePageFetch } from "./jarvis-page-audit";
import { normalizePexels, normalizeUnsplash, cleanPhotoQuery } from "./jarvis-stock-photos";

describe("page audit", () => {
  it("flags missing SEO basics", () => {
    const s = summarizePageFetch({ statusCode: 200, content: "<html><head><title>Hi</title></head><body><img src=a.jpg><h1>a</h1><h1>b</h1></body></html>" }, "https://x.com/")!;
    expect(s.imagesMissingAlt).toBe(1);
    expect(s.h1Count).toBe(2);
    expect(s.issues).toContain("Missing meta description.");
  });
  it("passes a complete page", () => {
    const html = `<title>Good</title><meta name="description" content="Desc"><meta name="viewport" content="width=device-width"><link rel="canonical" href="https://x.com/"><h1>One</h1><img src="a" alt="A">`;
    expect(summarizePageFetch({ statusCode: 200, content: html }, "https://x.com/")!.issues).toEqual([]);
  });
  it("rejects responses without content", () => {
    expect(summarizePageFetch({ statusCode: 200 }, "https://x.com/")).toBeNull();
  });
});

describe("stock photos", () => {
  it("keeps photographer credit and drops non-https", () => {
    const u = normalizeUnsplash({ results: [{ id: "1", urls: { regular: "https://i/1" }, user: { name: "Ann", links: { html: "https://unsplash.com/@ann" } } }, { id: "2", urls: { regular: "http://i/2" }, user: { name: "B" } }] });
    expect(u).toHaveLength(1);
    expect(u[0]!.credit).toBe("Photo by Ann on Unsplash");
    const p = normalizePexels({ photos: [{ id: 5, src: { large: "https://p/5" }, photographer: "Cy" }] });
    expect(p[0]!.credit).toBe("Photo by Cy on Pexels");
  });
  it("requires a real query", () => {
    expect(cleanPhotoQuery(" ")).toBeNull();
  });
});
