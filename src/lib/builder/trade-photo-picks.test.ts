import { describe, expect, it } from "vitest";

import { gradePhotoForSlot } from "@/lib/builder/image-framing";
import {
  focalForKnownPhoto,
  pexelsCdnUrl,
  picksForTrade,
  pickToStockPhoto,
  REJECTED_TRADE_PHOTOS,
  TRADE_PHOTO_PICKS,
  tradeKeyFor,
  type TradeKey,
} from "@/lib/builder/trade-photo-picks";
import { licenceAllowsBusinessUse, requiresCredit } from "@/lib/builder/stock-photos";

const TRADES: TradeKey[] = ["plumbing", "roofing", "hvac", "landscaping", "cleaning", "electrical", "detailing"];

describe("curated trade photos", () => {
  it("covers every trade with at least one picture", () => {
    for (const trade of TRADES) {
      expect(TRADE_PHOTO_PICKS.filter((pick) => pick.trade === trade).length, trade).toBeGreaterThan(0);
    }
  });

  it("records a photographer, alt text, a valid focal point and no duplicates for every pick", () => {
    const ids = new Set<string>();
    for (const pick of TRADE_PHOTO_PICKS) {
      expect(pick.photographer.trim().length, pick.id).toBeGreaterThan(1);
      expect(pick.alt.trim().length, pick.id).toBeGreaterThan(10);
      expect(pick.focal.x).toBeGreaterThanOrEqual(0);
      expect(pick.focal.x).toBeLessThanOrEqual(100);
      expect(pick.focal.y).toBeGreaterThanOrEqual(0);
      expect(pick.focal.y).toBeLessThanOrEqual(100);
      expect(ids.has(pick.id), `duplicate ${pick.id}`).toBe(false);
      ids.add(pick.id);
    }
  });

  it("only keeps pictures that pass the exposure rules, and none that were rejected", () => {
    const rejected = new Set(REJECTED_TRADE_PHOTOS.map((entry) => entry.id));
    for (const pick of TRADE_PHOTO_PICKS) {
      expect(gradePhotoForSlot({ ...pick.stats, framing: pick.framing }, "card").ok, pick.id).toBe(true);
      expect(rejected.has(pick.id), pick.id).toBe(false);
    }
  });

  it("never offers a close-up or portrait picture for a hero", () => {
    for (const trade of TRADES) {
      for (const pick of picksForTrade(trade, "hero")) {
        expect(pick.framing).not.toBe("detail");
        expect(pick.stats.aspect).toBeGreaterThanOrEqual(1.3);
      }
    }
    expect(picksForTrade("roofing", "hero").length).toBeGreaterThan(0);
  });

  it("maps free-text industries to trades", () => {
    expect(tradeKeyFor("Residential roofing company")).toBe("roofing");
    expect(tradeKeyFor("Plumbing & drains")).toBe("plumbing");
    expect(tradeKeyFor("HVAC")).toBe("hvac");
    expect(tradeKeyFor("Lawn care and landscaping")).toBe("landscaping");
    expect(tradeKeyFor("Mobile car detailing")).toBe("detailing");
    expect(tradeKeyFor("Electrician")).toBe("electrical");
    expect(tradeKeyFor("Commercial cleaning")).toBe("cleaning");
    expect(tradeKeyFor("Bakery")).toBeNull();
    expect(tradeKeyFor(null)).toBeNull();
    expect(picksForTrade("Bakery", "card")).toEqual([]);
  });

  it("converts a pick into a saveable free photo with its source and credit", () => {
    const pick = TRADE_PHOTO_PICKS[0]!;
    const photo = pickToStockPhoto(pick);
    expect(photo.url).toBe(pexelsCdnUrl(pick.id, 1600));
    expect(photo.url.startsWith("https://images.pexels.com/")).toBe(true);
    expect(photo.sourcePage).toBe(`https://www.pexels.com/photo/${pick.id}/`);
    expect(photo.creator).toBe(pick.photographer);
    expect(photo.attribution).toContain(pick.photographer);
    expect(licenceAllowsBusinessUse(photo.licenseCode)).toBe(true);
    expect(requiresCredit(photo.licenseCode)).toBe(false);
  });

  it("finds the focal point of a curated picture from any of its CDN sizes", () => {
    const pick = TRADE_PHOTO_PICKS[0]!;
    expect(focalForKnownPhoto(pexelsCdnUrl(pick.id, 480))).toEqual(pick.focal);
    expect(focalForKnownPhoto("https://images.pexels.com/photos/1/pexels-photo-1.jpeg")).toBeNull();
    expect(focalForKnownPhoto(undefined)).toBeNull();
  });
});
