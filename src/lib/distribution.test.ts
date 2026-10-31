import { describe, expect, it } from "vitest";

import {
  DAILY_ROUTINE,
  FREE_LISTINGS,
  buildChannelAssets,
  POSTAL_PLACEHOLDER,
  qrDataUrl,
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

describe("qrDataUrl", () => {
  it("makes the QR code locally, as an image, without calling an outside service", async () => {
    const url = await qrDataUrl("https://revoragrowthsystems.com/?utm_source=print", 5000);
    expect(url.startsWith("data:image/png;base64,")).toBe(true);
  });
  it("no longer references a third-party QR service", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("src/lib/distribution.ts", "utf8")).not.toContain("qrserver");
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
    expect(linkedin?.message).toContain("$350");
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

  it("does not pitch Google Business Profile as something that needs no address", () => {
    const text = JSON.stringify(FREE_LISTINGS);
    expect(text).not.toMatch(/business\.google|google business profile/i);
    expect(text).not.toMatch(/no (street )?address/i);
  });

  it("reports a realistic daily time cost", () => {
    expect(DAILY_ROUTINE.length).toBeGreaterThan(4);
    expect(routineMinutes()).toBe(DAILY_ROUTINE.reduce((t, i) => t + i.minutes, 0));
    expect(routineMinutes()).toBeGreaterThan(60);
  });
});

describe("share templates", () => {
  const assets = buildChannelAssets({ campaign: "launch" });
  const byId = (id: string) => assets.find((a) => a.id === id)!;

  it("tags WhatsApp as WhatsApp, not SMS", () => {
    expect(byId("whatsapp").message).toContain("utm_source=whatsapp");
    expect(byId("whatsapp").message).not.toContain("utm_source=sms");
    expect(byId("sms").message).toContain("utm_source=sms");
  });
  it("ends the email with a postal address line that is a placeholder until the sender supplies one", () => {
    expect(byId("email").message.endsWith(POSTAL_PLACEHOLDER)).toBe(true);
    expect(buildChannelAssets({ campaign: "x", postalAddress: "12 Pipe St, Austin, TX 78701" }).find((a) => a.id === "email")!.message).toContain("12 Pipe St, Austin, TX 78701");
    expect(byId("email").note).toContain("postal address");
  });
  it("keeps the phone number off the public share copy and avoids ranking promises", () => {
    for (const asset of assets) {
      expect(asset.message).not.toMatch(/\(\d{3}\) \d{3}-\d{4}/);
      expect(asset.message).not.toMatch(/website that ranks/i);
    }
  });
});
