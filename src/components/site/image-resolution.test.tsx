import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompositionRenderer } from "./CompositionRenderer";
import { CINEMATIC_CSS } from "./cinematic-css";
import { readImageDimensions } from "@/lib/builder/image-dimensions";
import {
  FULL_BLEED_MIN_WIDTH,
  fitsFullBleed,
  gradeFirstBuildImages,
  imageResolutionIssue,
  imageRole,
} from "@/lib/builder/first-build-image-qa";
import type { FirstBuildImageAsset } from "@/lib/builder/first-build-images.types";
import { readComponentVisual } from "@/lib/site-style";
import type { CompositionTree } from "@/lib/builder/composition-tree";

// Drop <style>…</style> blocks by index scanning (no regex sanitizer; test-only helper).
function stripStyles(html: string): string {
  let out = "";
  let rest = html;
  for (;;) {
    const start = rest.toLowerCase().indexOf("<style");
    if (start === -1) return out + rest;
    out += rest.slice(0, start);
    const end = rest.toLowerCase().indexOf("</style>", start);
    if (end === -1) return out;
    rest = rest.slice(end + "</style>".length);
  }
}


const asset = (over: Partial<FirstBuildImageAsset>): FirstBuildImageAsset => ({
  slot: "hero",
  label: "Hero picture",
  altText: "A freshly detailed black sedan under studio lights",
  path: "org/hero.png",
  mediaId: "m1",
  provider: "test",
  model: "test-model",
  prompt: "p",
  placement: ["home:hero"],
  aspectRatio: "16:9",
  ...over,
});

function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}
function jpeg(width: number, height: number): Uint8Array {
  // SOI, an APP0 segment, then SOF0 with height/width.
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 0, 0, 0, 0, 0, 0, 0]);
}
function webpVp8x(width: number, height: number): Uint8Array {
  const b = new Uint8Array(30);
  b.set([..."RIFF"].map((c) => c.charCodeAt(0)), 0);
  b.set([..."WEBPVP8X"].map((c) => c.charCodeAt(0)), 8);
  const w = width - 1, h = height - 1;
  b.set([w & 255, (w >> 8) & 255, (w >> 16) & 255, h & 255, (h >> 8) & 255, (h >> 16) & 255], 24);
  return b;
}

describe("image resolution check (quality bar #5)", () => {
  it("reads pixel size from PNG, JPEG and WebP headers", () => {
    expect(readImageDimensions(png(1536, 1024))).toEqual({ width: 1536, height: 1024 });
    expect(readImageDimensions(jpeg(800, 600))).toEqual({ width: 800, height: 600 });
    expect(readImageDimensions(webpVp8x(1920, 1080))).toEqual({ width: 1920, height: 1080 });
    expect(readImageDimensions(new Uint8Array(40))).toBeNull();
  });
  it("knows which pictures are full-bleed", () => {
    expect(imageRole(asset({}))).toBe("full-bleed");
    expect(imageRole(asset({ slot: "service-1", placement: ["services"] }))).toBe("inline");
    expect(imageRole(asset({ slot: "chapter-2", placement: ["scene"] }))).toBe("full-bleed");
  });
  it("flags undersized full-bleed and inline pictures, never unknown sizes", () => {
    expect(imageResolutionIssue({ width: 1024, height: 1024 }, "full-bleed")).toMatch(/too small to fill the screen/);
    expect(imageResolutionIssue({ width: 1920, height: 1080 }, "full-bleed")).toBeNull();
    expect(imageResolutionIssue({ width: FULL_BLEED_MIN_WIDTH, height: 400 }, "full-bleed")).toMatch(/too small/);
    expect(imageResolutionIssue({ width: 300, height: 200 }, "inline")).toMatch(/blurry/);
    expect(imageResolutionIssue({ width: 1024, height: 768 }, "inline")).toBeNull();
    expect(imageResolutionIssue({}, "full-bleed")).toBeNull();
  });
  it("keeps an undersized hero but demotes it from full-bleed (graceful fallback)", () => {
    const outcome = gradeFirstBuildImages([
      asset({ width: 1024, height: 1024 }),
      asset({ slot: "service-1", label: "Wash", path: "org/s1.png", placement: ["services"], width: 1024, height: 1024 }),
      asset({ slot: "service-2", label: "Tiny", path: "org/s2.png", placement: ["services"], width: 200, height: 150 }),
      asset({ slot: "hero-2", label: "Big hero", path: "org/h2.png", width: 1920, height: 1080 }),
    ]);
    expect(outcome.accepted.map((a) => a.slot)).toEqual(["hero", "service-1", "hero-2"]);
    expect(outcome.accepted[0]!.fullBleed).toBe(false);
    expect(outcome.accepted[2]!.fullBleed).toBeUndefined();
    expect(outcome.demoted).toEqual([expect.objectContaining({ slot: "hero" })]);
    expect(outcome.rejected).toEqual([expect.objectContaining({ slot: "service-2" })]);
  });
  it("persists size and the full-bleed verdict in the visual JSON (no migration)", () => {
    expect(readComponentVisual({ visual: { width: 1024, height: 768, full_bleed: false } })).toMatchObject({ width: 1024, height: 768, full_bleed: false });
    expect(readComponentVisual({ visual: { width: -4, full_bleed: true } })).toEqual({});
    expect(fitsFullBleed({ width: 1024, height: 768 })).toBe(false);
    expect(fitsFullBleed({ full_bleed: false })).toBe(false);
    expect(fitsFullBleed({ width: 2400, height: 1600 })).toBe(true);
    expect(fitsFullBleed({})).toBe(true);
  });
  it("frames an undersized scene picture instead of stretching it edge to edge", () => {
    const tree: CompositionTree = { version: 1, root: { type: "scene", anchor: "center-left", children: [{ type: "media", mediaRef: "m1" }, { type: "heading", level: 1, text: "Detailing, done right" }] } } as CompositionTree;
    const render = (visual: Record<string, unknown>) =>
      stripStyles(renderToStaticMarkup(<CompositionRenderer tree={tree} scope="qb2" resolveMedia={() => ({ url: "https://cdn.example/h.png", visual: { alt: "Black sedan", ...visual } })} />));
    const small = render({ width: 1024, height: 683 });
    expect(small).toContain("data-framed");
    expect(small).toMatch(/<img class="rv-scene-media" data-soft="" src="https:\/\/cdn.example\/h.png" alt="" aria-hidden="true"/);
    expect(small).toMatch(/<img class="rv-scene-frame" src="https:\/\/cdn.example\/h.png" alt="Black sedan" width="1024" height="683"/);
    expect(small).not.toContain("data-kenburns");
    const big = render({ width: 2400, height: 1600 });
    expect(big).not.toContain("data-framed");
    expect(big).not.toContain("rv-scene-frame");
    expect(big).toContain('alt="Black sedan"');
    expect(CINEMATIC_CSS).toContain(".rv-scene-frame{");
  });
});
