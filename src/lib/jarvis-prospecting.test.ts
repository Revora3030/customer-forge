import { afterEach, describe, expect, it, vi } from "vitest";
import { observe } from "@/lib/jarvis-prospecting.functions";

const page = (body: string) =>
  vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (new URL(url).hostname === "cloudflare-dns.com") {
      return Response.json({ Answer: url.includes("type=AAAA") ? [] : [{ type: 1, data: "93.184.216.34" }] });
    }
    return new Response(`<html><head><title>Acme</title></head><body>${body}</body></html>`, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  });

describe("prospect site observation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("treats a page whose only bulk is script as likely JS-rendered", async () => {
    vi.stubGlobal("fetch", page(`<div id="root"></div><script>${"x".repeat(5000)}</script >`));
    const result = await observe("https://example.com/");
    expect(result.checked).toBe(true);
    expect(result.likelyJsRendered).toBe(true);
  });

  it("does not flag a page with real visible text", async () => {
    vi.stubGlobal("fetch", page(`<h1>Acme</h1><p>${"We detail cars &amp; trucks. ".repeat(40)}</p>`));
    const result = await observe("https://example.com/");
    expect(result.likelyJsRendered).toBe(false);
    expect(result.h1Count).toBe(1);
  });
});
