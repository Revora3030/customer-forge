import { describe, expect, it } from "vitest";
import { pickPublicEventTypes } from "./calendly-options";

describe("pickPublicEventTypes", () => {
  it("keeps active public calendly links", () => {
    const r = pickPublicEventTypes({
      collection: [{ name: "Intro call", duration: 30, scheduling_url: "https://calendly.com/x/intro", active: true }],
    });
    expect(r).toEqual([{ name: "Intro call", minutes: 30, url: "https://calendly.com/x/intro" }]);
  });
  it("drops secret, inactive and non-calendly links", () => {
    const r = pickPublicEventTypes({
      collection: [
        { name: "Hidden", scheduling_url: "https://calendly.com/x/h", secret: true },
        { name: "Off", scheduling_url: "https://calendly.com/x/o", active: false },
        { name: "Evil", scheduling_url: "https://evil.example/x" },
      ],
    });
    expect(r).toEqual([]);
  });
});

import { ownDomainLogoUrl } from "./brand-logos";
describe("ownDomainLogoUrl", () => {
  it("uses only the owner's own domain and never a made-up fallback", () => {
    const u = new URL(ownDomainLogoUrl("https://www.acmeplumbing.com/about"));
    expect(u.hostname).toBe("img.logo.dev");
    expect(u.pathname).toBe("/acmeplumbing.com");
    expect(u.searchParams.get("fallback")).toBe("404");
  });
  it("rejects non-web addresses", () => {
    expect(ownDomainLogoUrl("javascript:alert(1)")).toBe("");
    expect(ownDomainLogoUrl("http://localhost:8080")).toBe("");
  });
});
