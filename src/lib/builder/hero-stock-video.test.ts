import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HERO_STOCK_CLIPS,
  HERO_VIDEO_LICENSE,
  heroStockClipsFor,
  heroVideoCredit,
  heroVideoDisabled,
  heroVideoTrade,
  isHeroVideoCategory,
  normalizePexelsVideo,
  pickHeroStockClip,
  readHeroVideo,
  type HeroVideoTrade,
} from "@/lib/builder/hero-stock-video";
import { ensureHeroStockVideo } from "@/lib/builder/hero-stock-video.server";
import { classifySiteMediaRow } from "@/lib/site-engine.worker.server";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("trade → stock hero clip", () => {
  it.each<[string, HeroVideoTrade | null]>([
    ["Mobile auto detailing", "auto-detailing"],
    ["Ceramic coating & paint correction", "auto-detailing"],
    ["Pressure washing", "pressure-washing"],
    ["Soft wash & power washing", "pressure-washing"],
    ["Pool cleaning and service", "pool-service"],
    ["Pest control", "pest-control"],
    ["Plumbing", "plumbing"],
    ["HVAC / heating and air conditioning", "hvac"],
    ["Roofing contractor", "roofing"],
    ["Electrician", "electrical"],
    ["Interior & exterior painting", "painting"],
    ["Lawn care and landscaping", "landscaping"],
    ["House cleaning / maid service", "cleaning"],
    ["Local movers", "moving"],
    ["Bakery", null],
    ["", null],
  ])("%s → %s", (text, trade) => {
    expect(heroVideoTrade(text)).toBe(trade);
  });

  it("has vetted, light, https-only clips for the launch trades", () => {
    for (const trade of ["auto-detailing", "pressure-washing", "pool-service", "plumbing", "hvac", "roofing", "landscaping", "cleaning", "general-contracting"] as const) {
      expect(heroStockClipsFor(trade).length, trade).toBeGreaterThan(0);
    }
    for (const clip of HERO_STOCK_CLIPS) {
      expect(clip.desktop).toMatch(/^https:\/\/videos\.pexels\.com\//);
      expect(clip.mobile).toMatch(/^https:\/\/videos\.pexels\.com\//);
      expect(clip.poster).toMatch(/^https:\/\/images\.pexels\.com\//);
      expect(clip.page).toMatch(/^https:\/\/www\.pexels\.com\/video\//);
      expect(clip.desktopBytes).toBeLessThanOrEqual(10 * 1024 * 1024);
      expect(clip.mobileBytes).toBeLessThanOrEqual(5 * 1024 * 1024);
      expect(clip.creator.length).toBeGreaterThan(0);
    }
    expect(new Set(HERO_STOCK_CLIPS.map((clip) => clip.id)).size).toBe(HERO_STOCK_CLIPS.length);
  });

  it("picks a stable clip per site and can skip the current one", () => {
    const first = pickHeroStockClip("auto-detailing", ORG);
    expect(first).not.toBeNull();
    expect(pickHeroStockClip("auto-detailing", ORG)?.id).toBe(first?.id);
    const next = pickHeroStockClip("auto-detailing", ORG, [first!.id]);
    if (heroStockClipsFor("auto-detailing").length > 1) expect(next?.id).not.toBe(first?.id);
  });

  it("credits the creator and Pexels", () => {
    expect(heroVideoCredit("  Jane   Doe ")).toBe("Video by Jane Doe on Pexels");
    expect(HERO_VIDEO_LICENSE).toBe("Pexels License");
  });
});

describe("Pexels API results", () => {
  const raw = (extra: Record<string, unknown> = {}) => ({
    id: 123,
    width: 1920,
    height: 1080,
    duration: 12,
    url: "https://www.pexels.com/video/water-spraying-on-a-driveway-123/",
    image: "https://images.pexels.com/videos/123/pictures/preview-0.jpg",
    user: { name: "Some Creator", url: "https://www.pexels.com/@someone" },
    video_files: [
      { file_type: "video/mp4", width: 1920, height: 1080, link: "https://videos.pexels.com/video-files/123/hd_1920_1080_25fps.mp4", size: 9_000_000 },
      { file_type: "video/mp4", width: 960, height: 540, link: "https://videos.pexels.com/video-files/123/sd_960_540_25fps.mp4", size: 2_000_000 },
      { file_type: "video/mp4", width: 3840, height: 2160, link: "https://videos.pexels.com/video-files/123/uhd.mp4", size: 60_000_000 },
    ],
    ...extra,
  });

  it("takes the HD desktop and SD phone renditions with an 8 s loop", () => {
    const clip = normalizePexelsVideo(raw(), "pressure-washing");
    expect(clip?.desktop).toContain("hd_1920_1080");
    expect(clip?.mobile).toContain("sd_960_540");
    expect(clip?.loopEnd).toBe(8);
    expect(clip?.creator).toBe("Some Creator");
  });

  it("rejects people, brands, portrait clips, odd lengths and non-Pexels links", () => {
    expect(normalizePexelsVideo(raw({ url: "https://www.pexels.com/video/a-man-washing-a-car-123/" }), "auto-detailing")).toBeNull();
    expect(normalizePexelsVideo(raw({ url: "https://www.pexels.com/video/woman-smiling-123/" }), "cleaning")).toBeNull();
    expect(normalizePexelsVideo(raw({ width: 1080, height: 1920 }), "cleaning")).toBeNull();
    expect(normalizePexelsVideo(raw({ duration: 2 }), "cleaning")).toBeNull();
    expect(normalizePexelsVideo(raw({ duration: 300 }), "cleaning")).toBeNull();
    expect(normalizePexelsVideo(raw({ video_files: [{ file_type: "video/mp4", width: 1920, height: 1080, link: "https://cdn.example.test/x.mp4" }] }), "cleaning")).toBeNull();
  });
});

describe("the site's hero pointer", () => {
  const pointer = (extra: Record<string, unknown> = {}) => ({ heroVideo: { version: 1, source: "stock", provider: "pexels", src: `${ORG}/hero.mp4`, mobileSrc: `${ORG}/hero-m.mp4`, poster: `${ORG}/p.jpg`, loopStart: 0, loopEnd: 8, ...extra } });

  it("reads only this site's own files", () => {
    expect(readHeroVideo(pointer(), ORG)?.src).toBe(`${ORG}/hero.mp4`);
    expect(readHeroVideo(pointer(), OTHER)).toBeNull();
    expect(readHeroVideo(pointer({ src: "https://videos.pexels.com/x.mp4" }), ORG)).toBeNull();
    expect(readHeroVideo(pointer({ src: `${ORG}/../${OTHER}/x.mp4` }), ORG)).toBeNull();
    expect(readHeroVideo(pointer({ mobileSrc: `${OTHER}/m.mp4` }), ORG)?.mobileSrc).toBeNull();
    expect(readHeroVideo(pointer({ source: "nonsense" }), ORG)).toBeNull();
    expect(readHeroVideo(null, ORG)).toBeNull();
  });

  it("supports owner and future AI clips, and an off switch", () => {
    expect(readHeroVideo(pointer({ source: "owner", provider: "owner" }), ORG)?.source).toBe("owner");
    expect(readHeroVideo(pointer({ source: "ai_generated", provider: "ai" }), ORG)?.source).toBe("ai_generated");
    const off = { heroVideo: { version: 1, disabled: true, setAt: "x" } };
    expect(readHeroVideo(off, ORG)).toBeNull();
    expect(heroVideoDisabled(off)).toBe(true);
  });

  it("keeps the clip, phone clip and poster out of the photo pool", () => {
    for (const category of ["hero_video", "hero_video_mobile", "hero_video_poster"]) {
      expect(isHeroVideoCategory(category)).toBe(true);
      expect(classifySiteMediaRow({ source: "stock:pexels", category, url: `${ORG}/x.jpg` })).toBe("skip");
    }
    expect(classifySiteMediaRow({ source: "stock:pexels", category: "gallery", url: `${ORG}/x.jpg` })).toBe("stock");
  });
});

/** A tiny in-memory stand-in for the Supabase client calls the hero code makes. */
function fakeDb(generation: Record<string, unknown> | null, options: { failUpload?: boolean } = {}) {
  const state = { generation, uploads: [] as string[], removed: [] as string[], rows: [] as Record<string, unknown>[], deleted: 0 };
  const chain = (table: string) => {
    let pending: Record<string, unknown> | null = null;
    let op: "select" | "update" | "insert" | "delete" = "select";
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      in: () => api,
      update: (value: Record<string, unknown>) => ((op = "update"), (pending = value), api),
      insert: (value: Record<string, unknown>) => ((op = "insert"), (pending = value), api),
      delete: () => ((op = "delete"), api),
      maybeSingle: async () => {
        if (table === "website_settings") return { data: state.generation === null ? null : { generation: state.generation }, error: null };
        if (op === "insert" && pending) {
          const row = { id: `m${state.rows.length + 1}`, ...pending };
          state.rows.push(row);
          return { data: { id: row.id }, error: null };
        }
        return { data: null, error: null };
      },
      then: (resolve: (value: unknown) => void) => {
        if (table === "website_settings" && op === "update" && pending) state.generation = pending["generation"] as Record<string, unknown>;
        if (op === "delete") state.deleted += 1;
        resolve({ data: null, error: null });
      },
    };
    return api;
  };
  const db = {
    from: chain,
    storage: {
      from: () => ({
        upload: async (path: string) => {
          if (options.failUpload && state.uploads.length) return { error: { message: "bucket full" } };
          state.uploads.push(path);
          return { error: null };
        },
        remove: async (paths: string[]) => {
          state.removed.push(...paths);
          return { error: null };
        },
      }),
    },
  };
  return { db: db as never, state };
}

const okFetch = (async (url: string) => {
  const image = new URL(String(url)).hostname === "images.pexels.com";
  return new Response(new Uint8Array(1024), { status: 200, headers: { "content-type": image ? "image/jpeg" : "video/mp4", "content-length": "1024" } });
}) as unknown as typeof fetch;

describe("ensureHeroStockVideo", () => {
  it("copies the clip into this site's own folder with its licence, then points the hero at it", async () => {
    const { db, state } = fakeDb({ pages: [] });
    const result = await ensureHeroStockVideo(db, ORG, { tradeText: "Mobile auto detailing", fetchImpl: okFetch, apiKey: null });
    expect(result.status).toBe("added");
    expect(state.uploads.length).toBeGreaterThanOrEqual(2);
    for (const path of state.uploads) expect(path.startsWith(`${ORG}/`)).toBe(true);
    for (const row of state.rows) {
      expect(row["organization_id"]).toBe(ORG);
      expect(row["source"]).toBe("stock:pexels");
      expect(row["license"]).toBe("Pexels License");
      expect(String(row["license_url"])).toMatch(/^https:\/\/www\.pexels\.com\/license/);
      expect(String(row["source_page"])).toMatch(/^https:\/\/www\.pexels\.com\/video\//);
      expect(String(row["attribution"])).toMatch(/^Video by .+ on Pexels$/);
      expect(isHeroVideoCategory(row["category"])).toBe(true);
    }
    const saved = readHeroVideo(state.generation, ORG);
    expect(saved?.source).toBe("stock");
    expect(state.generation?.["pages"]).toEqual([]);
  });

  it("leaves an existing or switched-off video alone, and unknown trades untouched", async () => {
    const existing = fakeDb({ heroVideo: { version: 1, source: "owner", src: `${ORG}/mine.mp4` } });
    expect((await ensureHeroStockVideo(existing.db, ORG, { tradeText: "plumbing", fetchImpl: okFetch, apiKey: null })).status).toBe("exists");
    const off = fakeDb({ heroVideo: { version: 1, disabled: true, setAt: "x" } });
    expect((await ensureHeroStockVideo(off.db, ORG, { tradeText: "plumbing", fetchImpl: okFetch, apiKey: null })).status).toBe("disabled");
    const bakery = fakeDb({});
    expect((await ensureHeroStockVideo(bakery.db, ORG, { tradeText: "Bakery", fetchImpl: okFetch, apiKey: null })).status).toBe("no_trade");
    expect(bakery.state.uploads).toEqual([]);
  });

  it("never throws: a failed upload cleans up and keeps the photo", async () => {
    const { db, state } = fakeDb({}, { failUpload: true });
    const result = await ensureHeroStockVideo(db, ORG, { tradeText: "roofing", fetchImpl: okFetch, apiKey: null });
    expect(result.status).toBe("failed");
    expect(state.removed).toEqual(state.uploads);
    expect(readHeroVideo(state.generation, ORG)).toBeNull();
  });

  it("rejects a download that is not a video", async () => {
    const { db, state } = fakeDb({});
    const html = (async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    expect((await ensureHeroStockVideo(db, ORG, { tradeText: "hvac", fetchImpl: html, apiKey: null })).status).toBe("failed");
    expect(state.uploads).toEqual([]);
  });
});

describe("wiring", () => {
  it("builds attach a stock loop after the page QA, and published pages read it from the published copy", () => {
    const worker = readFileSync("src/lib/site-engine.worker.server.ts", "utf8");
    expect(worker).toContain('import("@/lib/builder/hero-stock-video.server")');
    const site = readFileSync("src/lib/public-site.server.ts", "utf8");
    expect(site).toMatch(/live\.generation \?\? settings\.data\.generation/);
    expect(site).toContain('currentPage?.kind === "home"');
  });

  it("keeps the server download code out of client modules", () => {
    for (const file of ["src/lib/builder/hero-stock-video.ts", "src/components/site/CinematicBlocks.tsx", "src/components/site/CompositionRenderer.tsx", "src/components/app/BuilderCanvas.tsx"]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/from "[^"]*hero-stock-video\.server"|import\("[^"]*hero-stock-video\.server"\)/);
    }
  });
});
