import { describe, expect, it } from "vitest";
import { isUpgradeProspect, selectProspects, siteGaps } from "./prospect-finder";

const good = '<meta name="viewport" content="width=device-width"><a href="/book">Book now</a>' + "x".repeat(300);

describe("weak-website prospects", () => {
  it("finds no gaps on a phone-ready, https site with booking", () => {
    expect(siteGaps({ html: good, finalUrl: "https://a.com", loadMs: 900 })).toEqual([]);
  });
  it("flags a site with no viewport tag as not phone-ready", () => {
    expect(siteGaps({ html: "<p>Call us</p>", finalUrl: "https://a.com", loadMs: 900 })).toContain("not_mobile_friendly");
  });
  it("flags http and slow pages", () => {
    const gaps = siteGaps({ html: good, finalUrl: "http://a.com", loadMs: 5000 });
    expect(gaps).toEqual(["no_https", "slow_to_load"]);
  });
  it("pitches an upgrade only when not phone-ready or 2+ gaps", () => {
    expect(isUpgradeProspect(["not_mobile_friendly"])).toBe(true);
    expect(isUpgradeProspect(["slow_to_load"])).toBe(false);
    expect(isUpgradeProspect(["slow_to_load", "no_https"])).toBe(true);
    expect(isUpgradeProspect([])).toBe(false);
  });
  it("keeps businesses with websites only when asked", () => {
    const place = { id: "abcdefghijk", displayName: { text: "Cool Air" }, websiteUri: "https://coolair.com", addressComponents: [{ types: ["locality"], longText: "Mobile" }] };
    expect(selectProspects([place])).toHaveLength(0);
    expect(selectProspects([place], [], { includeWebsites: true })).toHaveLength(1);
  });
});
