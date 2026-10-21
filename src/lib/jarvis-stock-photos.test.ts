import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromLicensedStock, interleaveBySource, searchJarvisStockPhotos, type StockPhoto } from "./jarvis-stock-photos";
import { executeJarvisDiagnosticTool } from "./jarvis-diagnostic-tools.server";
import type { StockPhoto as LicensedStockPhoto } from "./builder/stock-photos";

vi.mock("./jarvis-diagnostics.server", () => ({ collectJarvisDiagnostics: vi.fn() }));
vi.mock("./integrations/registry.server", () => ({ providerSnapshots: vi.fn(() => []) }));

const db = {} as SupabaseClient;

const openverseBody = {
  results: Array.from({ length: 8 }, (_, i) => ({
    id: `ov-${i}`,
    title: `Foam wash ${i}`,
    url: `https://live.staticflickr.com/65535/ov-${i}.jpg`,
    thumbnail: `https://api.openverse.org/v1/images/ov-${i}/thumb/`,
    provider: "flickr",
    creator: `Flickr user ${i}`,
    license: "by",
    license_version: "2.0",
    license_url: "https://creativecommons.org/licenses/by/2.0/",
    foreign_landing_url: `https://www.flickr.com/photos/user/ov-${i}`,
    attribution: `"Foam wash ${i}" by Flickr user ${i} is licensed under CC BY 2.0.`,
    width: 1024,
    height: 768,
  })),
};

const wikimediaBody = {
  query: {
    pages: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(100 + i), {
      pageid: 100 + i,
      ns: 6,
      index: i + 1,
      title: `File:Detailing ${i}.jpg`,
      imageinfo: [{
        url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/Detailing_${i}.jpg`,
        thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Detailing_${i}.jpg/1600px-Detailing_${i}.jpg`,
        thumbwidth: 1600,
        thumbheight: 1200,
        descriptionurl: `https://commons.wikimedia.org/wiki/File:Detailing_${i}.jpg`,
        extmetadata: {
          LicenseShortName: { value: "CC BY-SA 4.0" },
          LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" },
          Artist: { value: `<a href="//commons.wikimedia.org/wiki/User:W${i}">Commons user ${i}</a>` },
        },
      }],
    }])),
  },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Routes each request by host; any other host fails the test. */
function stubHosts(routes: Record<string, () => Response | Promise<Response>>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const host = new URL(String(input)).host;
    const route = routes[host];
    if (!route) throw new Error(`unexpected host ${host}`);
    return route();
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const noKeys = { UNSPLASH_ACCESS_KEY: "", PEXELS_API_KEY: "" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("fromLicensedStock", () => {
  it("keeps licence, provenance and the exact credit line", () => {
    const photo: LicensedStockPhoto = {
      id: "a1",
      title: "Bakery counter",
      url: "https://example.org/a1.jpg",
      thumbnail: "https://example.org/a1-small.jpg",
      provider: "flickr",
      creator: "Sam",
      licenseCode: "by",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      attribution: '"Bakery counter" by Sam is licensed under CC BY 2.0.',
      sourcePage: "https://flickr.com/photo/1",
      width: 1600,
      height: 1000,
    };
    expect(fromLicensedStock(photo, "openverse")).toEqual({
      source: "openverse",
      id: "a1",
      url: "https://example.org/a1.jpg",
      thumbUrl: "https://example.org/a1-small.jpg",
      alt: "Bakery counter",
      photographer: "Sam",
      photographerUrl: "",
      pageUrl: "https://flickr.com/photo/1",
      credit: '"Bakery counter" by Sam is licensed under CC BY 2.0.',
      license: "by",
      licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
      sourcePage: "https://flickr.com/photo/1",
      attribution: '"Bakery counter" by Sam is licensed under CC BY 2.0.',
    });
  });
});

describe("interleaveBySource", () => {
  it("alternates sources, removes duplicate URLs and caps the list", () => {
    const make = (source: StockPhoto["source"], n: number, shared = false): StockPhoto[] =>
      Array.from({ length: n }, (_, i) => ({ source, id: `${source}${i}`, url: shared && i === 0 ? "https://x/same.jpg" : `https://x/${source}${i}.jpg`, thumbUrl: "", alt: "", photographer: "", photographerUrl: "", pageUrl: "", credit: "" }));
    const out = interleaveBySource([make("openverse", 3, true), make("wikimedia", 3, true)], 4);
    expect(out.map((photo) => photo.id)).toEqual(["openverse0", "openverse1", "wikimedia1", "openverse2"]);
  });
});

describe("searchJarvisStockPhotos", () => {
  it("searches Openverse and Wikimedia without keys and never contacts keyed sources", async () => {
    const fetchMock = stubHosts({
      "api.openverse.org": () => json(openverseBody),
      "commons.wikimedia.org": () => json(wikimediaBody),
    });
    const outcome = await searchJarvisStockPhotos("foam wash", noKeys);
    expect(outcome.anySourceAnswered).toBe(true);
    expect(outcome.sources).toEqual({ openverse: "ok", wikimedia: "ok", unsplash: "needs_key", pexels: "needs_key" });
    expect(outcome.photos.length).toBeLessThanOrEqual(12);
    expect(outcome.photos.slice(0, 4).map((photo) => photo.source)).toEqual(["openverse", "wikimedia", "openverse", "wikimedia"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const wikimediaCall = fetchMock.mock.calls.find(([url]) => String(url).includes("wikimedia"))!;
    expect(wikimediaCall[1]?.headers).toMatchObject({ "Api-User-Agent": expect.stringContaining("RevoraGrowthSystems/1.0") });
    expect(outcome.photos.find((photo) => photo.source === "wikimedia")).toMatchObject({
      license: "by-sa",
      attribution: '"Detailing 0" by Commons user 0, CC BY-SA 4.0 via Wikimedia Commons',
      sourcePage: "https://commons.wikimedia.org/wiki/File:Detailing_0.jpg",
    });
  });

  it("reports Openverse 429 as free_quota_exhausted while Wikimedia still answers", async () => {
    stubHosts({
      "api.openverse.org": () => json({ detail: "throttled" }, 429),
      "commons.wikimedia.org": () => json(wikimediaBody),
    });
    const outcome = await searchJarvisStockPhotos("foam wash", noKeys);
    expect(outcome.sources.openverse).toBe("free_quota_exhausted");
    expect(outcome.sources.wikimedia).toBe("ok");
    expect(outcome.photos.length).toBeGreaterThan(0);
    expect(outcome.photos.every((photo) => photo.source === "wikimedia")).toBe(true);
  });

  it("adds Unsplash only when its key is saved", async () => {
    const fetchMock = stubHosts({
      "api.openverse.org": () => json({ results: [] }),
      "commons.wikimedia.org": () => { throw new TypeError("network down"); },
      "api.unsplash.com": () => json({ results: [{ id: "u1", urls: { regular: "https://images.unsplash.com/u1", small: "https://images.unsplash.com/u1s" }, user: { name: "Ann", links: { html: "https://unsplash.com/@ann" } }, links: { html: "https://unsplash.com/photos/u1" } }] }),
    });
    const outcome = await searchJarvisStockPhotos("foam wash", { UNSPLASH_ACCESS_KEY: "unsplash-key", PEXELS_API_KEY: "" });
    expect(outcome.sources).toEqual({ openverse: "ok", wikimedia: "unreachable", unsplash: "ok", pexels: "needs_key" });
    expect(outcome.photos.map((photo) => photo.source)).toEqual(["unsplash"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("images.stock.search executor", () => {
  it("returns observed licensed photos without Unsplash or Pexels keys, under 9 KB", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "");
    vi.stubEnv("PEXELS_API_KEY", "");
    stubHosts({
      "api.openverse.org": () => json(openverseBody),
      "commons.wikimedia.org": () => json(wikimediaBody),
    });
    const out = await executeJarvisDiagnosticTool(db, "images.stock.search", { query: "foam wash" });
    expect(out.status).toBe("observed");
    const data = out.data as { sources: Record<string, string>; photos: StockPhoto[]; truncated?: boolean };
    expect(data.truncated).toBeUndefined();
    expect(data.sources).toMatchObject({ openverse: "ok", wikimedia: "ok", unsplash: "needs_key", pexels: "needs_key" });
    expect(data.photos.length).toBeGreaterThan(0);
    expect(data.photos.length).toBeLessThanOrEqual(12);
    expect(data.photos.every((photo) => photo.license && photo.attribution && photo.credit === photo.attribution)).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(out.data)).byteLength).toBeLessThan(9000);
    expect(JSON.stringify(out)).not.toContain("needs_key\",\"secret");
  });

  it("is unknown only when every source fails", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "");
    vi.stubEnv("PEXELS_API_KEY", "");
    stubHosts({
      "api.openverse.org": () => json({}, 503),
      "commons.wikimedia.org": () => { throw new TypeError("network down"); },
    });
    const out = await executeJarvisDiagnosticTool(db, "images.stock.search", { query: "foam wash" });
    expect(out.status).toBe("unknown");
    expect(out.data).toMatchObject({ reason: "all_sources_failed", sources: { openverse: "http_503", wikimedia: "unreachable" }, photos: [] });
  });

  it("needs a query and fetches nothing without one", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await executeJarvisDiagnosticTool(db, "images.stock.search", {});
    expect(out.data).toMatchObject({ reason: "missing_query" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
