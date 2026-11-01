import { describe, expect, it } from "vitest";

import {
  focalToObjectPosition,
  gradePhotoForSlot,
  gradePhotoStats,
  pexelsPhotoId,
  responsiveImage,
} from "@/lib/builder/image-framing";

const good = { aspect: 1.5, mean: 0.5, contrast: 0.22, darkShare: 0.08 };

describe("image framing rules", () => {
  it("accepts a well-exposed picture and rejects dark, flat and washed-out ones", () => {
    expect(gradePhotoStats(good).ok).toBe(true);
    expect(gradePhotoStats({ ...good, mean: 0.2 })).toEqual({ ok: false, reason: "too dark" });
    expect(gradePhotoStats({ ...good, darkShare: 0.4 }).ok).toBe(false);
    expect(gradePhotoStats({ ...good, mean: 0.93 })).toEqual({ ok: false, reason: "washed out" });
    expect(gradePhotoStats({ ...good, contrast: 0.05 })).toEqual({ ok: false, reason: "too flat" });
    expect(gradePhotoStats({ ...good, mean: Number.NaN }).ok).toBe(false);
  });

  it("keeps close-ups and portraits off the hero but allows them on cards", () => {
    expect(gradePhotoForSlot({ ...good, framing: "detail" }, "hero").ok).toBe(false);
    expect(gradePhotoForSlot({ ...good, framing: "detail" }, "card").ok).toBe(true);
    expect(gradePhotoForSlot({ ...good, aspect: 0.67, framing: "wide" }, "hero").ok).toBe(false);
    expect(gradePhotoForSlot({ ...good, framing: "medium" }, "hero").ok).toBe(true);
    expect(gradePhotoForSlot({ ...good, mean: 0.1, framing: "wide" }, "card").ok).toBe(false);
  });

  it("writes a clamped object-position from a focal point", () => {
    expect(focalToObjectPosition({ x: 55.4, y: 40 })).toBe("55% 40%");
    expect(focalToObjectPosition({ x: -10, y: 140 })).toBe("0% 100%");
  });

  it("builds a srcset for Pexels and Unsplash and leaves other hosts alone", () => {
    const pexels = responsiveImage("https://images.pexels.com/photos/1/pexels-photo-1.jpeg?auto=compress&cs=tinysrgb&h=627&fit=crop&w=1200", "100vw");
    expect(pexels.srcSet).toContain("w=480");
    expect(pexels.srcSet).toContain("w=1600 1600w");
    expect(pexels.srcSet).not.toContain("h=627");
    expect(pexels.srcSet).not.toContain("fit=crop");
    expect(pexels.sizes).toBe("100vw");
    expect(responsiveImage("https://images.unsplash.com/photo-abc?w=1000", "50vw").srcSet).toContain("w=800 800w");
    expect(responsiveImage("https://example.com/a.jpg", "100vw")).toEqual({ src: "https://example.com/a.jpg" });
    expect(responsiveImage("not a url", "100vw")).toEqual({ src: "not a url" });
    expect(responsiveImage("http://images.pexels.com/photos/1/a.jpg", "100vw").srcSet).toBeUndefined();
  });

  it("reads the id from a Pexels CDN address only", () => {
    expect(pexelsPhotoId("https://images.pexels.com/photos/4162011/pexels-photo-4162011.jpeg?w=1")).toBe("4162011");
    expect(pexelsPhotoId("https://example.com/photos/4162011/x.jpg")).toBeNull();
    expect(pexelsPhotoId("garbage")).toBeNull();
  });
});
