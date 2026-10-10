import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./FreeAccess.tsx", import.meta.url), "utf8");

describe("free-access marketing contract", () => {
  it("distinguishes free exploration from paid setup and publishing", () => {
    expect(source).toContain("Free exploration, website implementation and a live launch are separate steps.");
    expect(source).toContain("Exploring free access does not itself publish a finished website.");
    expect(source).not.toContain("nothing locked");
    expect(source).not.toContain("watch the automations fire — before you pay anything");
  });

  it("does not imply live integrations are verified by exploring the workspace", () => {
    expect(source).toContain("Live integrations depend on configuration and provider availability.");
    expect(source).toContain("messages, bookings or payments have been verified.");
  });

  it("preserves the signup destination and shared pricing configuration", () => {
    expect(source).toContain('FREE_ACCESS_TO = "/auth"');
    expect(source).toContain('mode: "signup", redirect: "/get-started"');
    expect(source).toContain("GROWTH_SYSTEM.setupPrice");
    expect(source).toContain("GROWTH_SYSTEM.monthlyPrice");
    expect(source).toContain("GROWTH_SYSTEM.fullAccessWindow");
  });
});
