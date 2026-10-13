import { describe, expect, it } from "vitest";
import { liveSiteAllowed } from "@/lib/live-site-access";

const day = 86_400_000;

describe("live site access", () => {
  it("trial customers may publish and stay live", () => {
    expect(liveSiteAllowed({ id: "a", trial_ends_at: new Date(Date.now() + day).toISOString(), subscription_status: "trialing" })).toBe(true);
  });
  it("site goes offline once the trial ends unpaid", () => {
    expect(liveSiteAllowed({ id: "a", trial_ends_at: new Date(Date.now() - day).toISOString(), subscription_status: "trialing" })).toBe(false);
  });
  it("site comes back once the setup fee is paid", () => {
    expect(liveSiteAllowed({ id: "a", trial_ends_at: new Date(Date.now() - day).toISOString(), subscription_status: "trialing", setup_paid_at: new Date().toISOString() })).toBe(true);
  });
  it("suspended workspaces never serve", () => {
    expect(liveSiteAllowed({ id: "a", is_suspended: true, setup_paid_at: new Date().toISOString() })).toBe(false);
  });
});
