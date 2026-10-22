import { describe, expect, it } from "vitest";
import { prospectSearchUsesGoogle } from "./jarvis-demo-site.server";
import { demoOfferTerms, fallbackDemoEmail } from "./prospect-outreach.server";

describe("free-only prospect search", () => {
  it("never uses Google unless asked", () => expect(prospectSearchUsesGoogle(undefined, {})).toBe(false));
  it("uses Google only when asked and no zero-cost switch is on", () => {
    expect(prospectSearchUsesGoogle("google", {})).toBe(true);
    expect(prospectSearchUsesGoogle("google", { ZERO_COST_ONLY: "true" })).toBe(false);
  });
});
describe("demo email price disclosure", () => {
  it("states $350 setup, free first month, then $100/month", () => {
    expect(demoOfferTerms()).toContain("$350");
    expect(demoOfferTerms()).toContain("$100/month");
    expect(fallbackDemoEmail({ name: "A", siteGaps: [] }, "https://x/p/1").body).toContain("$350");
  });
});
