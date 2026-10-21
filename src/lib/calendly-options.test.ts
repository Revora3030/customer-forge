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
