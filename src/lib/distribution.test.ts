import { describe, expect, it } from "vitest";

import {
  DAILY_ROUTINE,
  FREE_LISTINGS,
  buildChannelAssets,
  qrImageUrl,
  routineMinutes,
  trackedLink,
} from "@/lib/distribution";

describe("trackedLink", () => {
  it("tags the platform domain with normalised utm parameters", () => {
    const url = trackedLink("/pricing", {
      source: "Facebook Groups",
      medium: "Social",
      campaign: "NC Contractors",
    });
    expect(url).toContain("https://revoragrowthsystems.com/pricing?");
    expect(url).toContain("utm_source=facebook-groups");
    expect(url).toContain("utm_medium=social");
    expect(url).toContain("utm_campaign=nc-contractors");
  });

  it("falls back to the homepage for an empty path", () => {
    expect(trackedLink("", { source: "sms", medium: "text", campaign: "x" })).toMatch(
      /^https:\/\/revoragrowthsystems\.com\?/,
    );
  });
});

describe("qrImageUrl", () => {
  it("encodes the target and clamps the size", () => {
    const url = qrImageUrl("https://revoragrowthsystems.com/?utm_source=print", 5000);
    expect(url).toContain("1000x1000");
    expect(url).toContain(encodeURIComponent("https://revoragrowthsystems.com/?utm_source=print"));
  });
});

describe("buildChannelAssets", () => {
  const assets = buildChannelAssets({
    campaign: "launch",
    audience: "HVAC companies in Charlotte",
  });

  it("returns a message and a consent note for every channel", () => {
    expect(assets.length).toBeGreaterThan(10);
    for (const asset of assets) {
      expect(asset.message.trim().length).toBeGreaterThan(20);
      expect(asset.note.trim().length).toBeGreaterThan(10);
    }
  });

  it("uses the audience in the copy and never invents a price", () => {
    const linkedin = assets.find((a) => a.id === "linkedin");
    expect(linkedin?.message).toContain("HVAC companies in Charlotte");
    expect(linkedin?.message).toContain("$750");
    expect(linkedin?.message).toContain("$100");
  });

  it("tracks every embedded link with the campaign", () => {
    for (const asset of assets) {
      const urls = asset.message.match(/https:\/\/revoragrowthsystems\.com\S+/g) ?? [];
      for (const url of urls) expect(url).toContain("utm_campaign=launch");
    }
  });

  it("omits a composer link where the platform has none", () => {
    expect(assets.find((a) => a.id === "instagram")?.intentUrl).toBeNull();
    expect(assets.find((a) => a.id === "broadcast")?.intentUrl).toBeNull();
    expect(assets.find((a) => a.id === "sms")?.intentUrl).toContain("sms:?&body=");
  });
});

describe("free channel catalogue", () => {
  it("lists only free listings with absolute urls", () => {
    expect(FREE_LISTINGS.length).toBeGreaterThan(8);
    for (const listing of FREE_LISTINGS) {
      expect(listing.free).toBe(true);
      expect(listing.url.startsWith("https://")).toBe(true);
    }
  });

  it("reports a realistic daily time cost", () => {
    expect(DAILY_ROUTINE.length).toBeGreaterThan(4);
    expect(routineMinutes()).toBe(DAILY_ROUTINE.reduce((t, i) => t + i.minutes, 0));
    expect(routineMinutes()).toBeGreaterThan(60);
  });
});
