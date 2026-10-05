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

  it("does not grant the waiver to an account whose email was changed to the owner's", () => {
    // Email spoofing defense is structural: the gate requires BOTH the fixed
    // internal org id AND the fixed email. An attacker who takes over or
    // renames another account to revorabusiness0@gmail.com still fails,
    // because their workspace id is not the pinned PLATFORM_OWNER_ORG_ID —
    // and the webhook independently re-reads the email from the auth record
    // (never from client-supplied metadata) before honoring any waiver.
    const impostorOrgId = "11111111-1111-1111-1111-111111111111";
    expect(isPlatformOwnerAccount(impostorOrgId, PLATFORM_OWNER_EMAIL)).toBe(false);
    // Case/whitespace tricks on an otherwise-correct pair still normalize to
    // the real owner — but only with the pinned org id.
    expect(isPlatformOwnerAccount(impostorOrgId, " RevoraBusiness0@gmail.com ")).toBe(false);
    expect(isPlatformOwnerAccount(PLATFORM_OWNER_ORG_ID, " RevoraBusiness0@gmail.com ")).toBe(true);
    // A null/empty email can never match, even on the pinned org.
    expect(isPlatformOwnerAccount(PLATFORM_OWNER_ORG_ID, null)).toBe(false);
    expect(isPlatformOwnerAccount(PLATFORM_OWNER_ORG_ID, "")).toBe(false);
  });
});
