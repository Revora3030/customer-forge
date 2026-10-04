import { describe, expect, it } from "vitest";
import { resolveAccess } from "@/lib/access-state";
import { PLATFORM_OWNER_EMAIL, PLATFORM_OWNER_ORG_ID, isPlatformOwnerAccount } from "@/lib/platform-owner";

describe("platform owner workspace", () => {
  const expired = { created_at: "2020-01-01T00:00:00Z", trial_ends_at: "2020-01-02T00:00:00Z", subscription_status: "trialing" };
  it("stays unlocked without a setup payment", () => {
    expect(resolveAccess({ ...expired, id: PLATFORM_OWNER_ORG_ID }).allowed).toBe(true);
  });

  it("gives no other workspace a free pass", () => {
    expect(resolveAccess({ ...expired, id: "00000000-0000-0000-0000-000000000000" }).allowed).toBe(false);
  });
  it("requires the exact internal email for a billing waiver", () => {
    expect(isPlatformOwnerAccount(PLATFORM_OWNER_ORG_ID, PLATFORM_OWNER_EMAIL)).toBe(true);
    expect(isPlatformOwnerAccount(PLATFORM_OWNER_ORG_ID, "someone@example.com")).toBe(false);
    expect(isPlatformOwnerAccount("00000000-0000-0000-0000-000000000000", PLATFORM_OWNER_EMAIL)).toBe(false);
  });
});
