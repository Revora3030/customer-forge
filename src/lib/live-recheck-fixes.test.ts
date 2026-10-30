import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pairingRoleFont } from "@/lib/site-theme";
import { previewLinkInput, PREVIEW_LINK_DENIED, PREVIEW_LINK_SAVE_FAILED } from "@/lib/preview-links";
import { friendlyError } from "@/lib/user-error";
import { heroVideoSlot, readHeroVideoStatus } from "@/lib/builder/hero-stock-video";
import { heroAttachFailure } from "@/lib/builder/hero-stock-video.server";
import { heroUploadProblem, heroVideoSlotNote, heroVideoStatusLine } from "@/lib/hero-video-panel";
import { CINEMATIC_CSS } from "@/components/site/cinematic-css";

const read = (p: string) => readFileSync(p, "utf8");

describe("fonts: pairing role fonts", () => {
  it("maps AI per-node faces onto the loaded pairing", () => {
    expect(pairingRoleFont(undefined, false)).toBeUndefined();
    expect(pairingRoleFont("Barlow Condensed", true)).toBe("var(--font-heading)");
    expect(pairingRoleFont("Source Sans 3", false)).toBe("var(--font-body)");
    expect(pairingRoleFont("display", false)).toBe("var(--font-heading)");
    expect(pairingRoleFont("mono", false)).toContain("monospace");
  });
  it("site root sets font-family and loads the pairing stylesheet", () => {
    const view = read("src/routes/s.$slug.$page.tsx");
    expect(view).toContain('fontFamily: "var(--font-body)"');
    expect(view).toContain("<SiteFontLinks");
    const links = read("src/components/site/SiteFontLinks.tsx");
    expect(links).toMatch(/rel="stylesheet"[\s\S]*precedence=/);
  });
});

describe("blank sections: entrance animations never hide content", () => {
  const motion = read("src/components/site/CompositionRenderer.tsx");
  const styles = read("src/styles.css");
  const keyframes = (css: string) => css.match(/@keyframes\s+rv-[\w-]+\s*\{[\s\S]*?\}\s*\}/g) ?? [];
  it("no rv-* keyframe starts from opacity 0 or a fully clipped inset", () => {
    const all = [...keyframes(motion), ...keyframes(CINEMATIC_CSS), ...keyframes(styles)].filter((kf) => /rv-(cn|scene|section)/.test(kf));
    expect(all.length).toBeGreaterThan(8);
    for (const kf of all) {
      expect(kf, kf).not.toMatch(/from\s*\{[^}]*opacity:\s*(0|\.0*1|0\.0*1)\b/);
      expect(kf, kf).not.toMatch(/from\s*\{[^}]*inset\(\s*100%/);
    }
  });
  it("scroll-timeline ancestors use overflow:clip", () => {
    expect(CINEMATIC_CSS).toMatch(/\.rv-scene\{[^}]*overflow:clip/);
    expect(motion).toContain("rv-cn-faq-panel-inner{min-height:0;overflow:hidden;overflow:clip");
  });
});

describe("preview links", () => {
  it("validates input", () => {
    expect(() => previewLinkInput({ organizationId: "nope" })).toThrow(/no workspace/);
    const ok = previewLinkInput({ organizationId: "11111111-2222-3333-4444-555555555555", hours: 99999, label: "  x " });
    expect(ok).toEqual({ organizationId: "11111111-2222-3333-4444-555555555555", label: "x", hours: 720 });
  });
  it("errors survive friendlyError verbatim", () => {
    expect(friendlyError(new Error(PREVIEW_LINK_DENIED), "fallback")).toBe(PREVIEW_LINK_DENIED);
    expect(friendlyError(new Error(PREVIEW_LINK_SAVE_FAILED), "fallback")).toBe(PREVIEW_LINK_SAVE_FAILED);
  });
  it("migration lets support sessions manage preview links", () => {
    const sql = read("supabase/migrations/20261030120000_preview_links_support_and_hero_video_bucket.sql");
    expect(sql).toContain("private.can_manage_org");
    expect(sql).toContain("video/mp4");
  });
});

describe("hero video status", () => {
  it("reads a recorded status", () => {
    expect(readHeroVideoStatus(null)).toBeNull();
    expect(readHeroVideoStatus({ heroVideoStatus: { status: "bogus" } })).toBeNull();
    expect(readHeroVideoStatus({ heroVideoStatus: { status: "failed", message: "m", at: "2026-10-30T07:00:00Z", trigger: "build" } }))
      .toEqual({ status: "failed", message: "m", at: "2026-10-30T07:00:00Z", trigger: "build" });
  });
  it("finds where the loop can play", () => {
    expect(heroVideoSlot({ root: { type: "stack", children: [{ type: "scene", children: [{ type: "media" }] }] } })).toBe("scene");
    expect(heroVideoSlot({ root: { type: "stack", children: [{ type: "text" }, { type: "media" }] } })).toBe("picture");
    expect(heroVideoSlot({ root: { type: "stack", children: [{ type: "text" }] } })).toBe("none");
  });
  it("names storage rejections", () => {
    expect(heroAttachFailure("mime type video/mp4 is not supported")).toMatch(/allow videos/);
    expect(heroAttachFailure("network down")).toMatch(/could not be added \(network down\)/);
  });
  it("owner-visible lines", () => {
    expect(heroVideoStatusLine(null)).toBeNull();
    expect(heroVideoStatusLine({ status: "exists", message: "", at: "", trigger: "build" })).toBeNull();
    expect(heroVideoStatusLine({ status: "failed", message: "boom", at: "", trigger: "build" })).toMatch(/After the last build, no new video was added: boom/);
    expect(heroVideoSlotNote("none")).toMatch(/nowhere to play/);
    expect(heroVideoSlotNote("picture")).toBeNull();
    expect(heroUploadProblem({ type: "image/png", size: 1 })).toMatch(/MP4/);
    expect(heroUploadProblem({ type: "video/mp4", size: 50 * 1024 * 1024 })).toMatch(/40 MB/);
    expect(heroUploadProblem({ type: "video/mp4", size: 1 })).toBeNull();
  });
  it("the panel is mounted on the website settings route", () => {
    expect(read("src/routes/_authenticated/app.website.tsx")).toContain("<HeroVideoPanel");
  });
});
