import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { claimErrorMessage, isClaimToken } from "./prospect-claim";

const migration = readFileSync("supabase/migrations/20261016090000_claim_prospect_demo.sql", "utf8");

describe("claim tokens", () => {
  it("accepts preview tokens and rejects anything else", () => {
    expect(isClaimToken("abcdefghij0123456789")).toBe(true);
    expect(isClaimToken("short")).toBe(false);
    expect(isClaimToken("abcdefghij0123456789/../x")).toBe(false);
    expect(isClaimToken(undefined)).toBe(false);
  });
});

describe("claimErrorMessage", () => {
  it("maps database refusals to plain language", () => {
    expect(claimErrorMessage({ message: "ALREADY_HAS_WORKSPACE" })).toMatch(/already has a Revora workspace/);
    expect(claimErrorMessage({ message: "CLAIM_NOT_AVAILABLE" })).toMatch(/can't be claimed/);
    expect(claimErrorMessage(null)).toMatch(/try again/);
  });
});

describe("claim_prospect_demo_server migration", () => {
  it("is server-only", () => {
    expect(migration).toMatch(/SECURITY DEFINER/);
    expect(migration).toMatch(/SET search_path/);
    for (const role of ["public", "anon", "authenticated"])
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.claim_prospect_demo_server(text, uuid, integer) FROM ${role};`);
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.claim_prospect_demo_server(text, uuid, integer) TO service_role;");
  });

  it("only claims a live, unclaimed prospect demo for a person without a workspace", () => {
    expect(migration).toContain("raise exception 'ALREADY_HAS_WORKSPACE'");
    expect(migration).toMatch(/v_link\.revoked or v_link\.expires_at <= now\(\)/);
    expect(migration).toMatch(/o\.is_demo for update/);
    expect(migration).toMatch(/\? 'claimedAt'/);
    expect(migration).toContain("hashtextextended(_user_id::text, 7)");
  });

  it("hands over ownership, starts the trial and switches off old links", () => {
    expect(migration).toMatch(/set is_demo = false/);
    expect(migration).toMatch(/delete from public\.memberships where organization_id = v_org/);
    expect(migration).toMatch(/insert into public\.platform_trials/);
    expect(migration).toMatch(/update public\.website_preview_links\s+set revoked = true/);
  });
});
