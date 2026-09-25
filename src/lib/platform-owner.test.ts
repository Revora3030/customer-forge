import { describe, expect, it } from "vitest";
import { resolveAccess } from "@/lib/access-state";
import { PLATFORM_OWNER_ORG_ID } from "@/lib/platform-owner";

describe("platform owner workspace", () => {
  const expired = { created_at: "2020-01-01T00:00:00Z", trial_ends_at: "2020-01-02T00:00:00Z", subscription_status: "trialing" };
  it("stays unlocked without a setup payment", () => {
    expect(resolveAccess({ ...expired, id: PLATFORM_OWNER_ORG_ID }).allowed).toBe(true);
  });
  it("gives no other workspace a free pass", () => {
    expect(resolveAccess({ ...expired, id: "00000000-0000-0000-0000-000000000000" }).allowed).toBe(false);
  });
});
