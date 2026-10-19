import { describe, expect, it } from "vitest";
import { autopilotShouldBuild } from "./prospect-finder";

describe("autopilot build filter", () => {
  it("builds when there is an email and no website", () => {
    expect(autopilotShouldBuild({ presence: "none", email: "owner@shop.com" })).toBe(true);
  });
  it("skips businesses without an email", () => {
    expect(autopilotShouldBuild({ presence: "none", email: null })).toBe(false);
  });
  it("skips businesses that already have a website", () => {
    expect(autopilotShouldBuild({ presence: "has_website", email: "owner@shop.com" })).toBe(false);
  });
});
