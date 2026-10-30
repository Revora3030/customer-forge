import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  authEmailRedirectTo,
  checkoutResumeRedirect,
  claimAwareRedirect,
  claimErrorMessage,
  isClaimToken,
  isSafeRedirect,
} from "./prospect-claim";

describe("claim token survives sign-up", () => {
  const token = "abcdefghij0123456789";

  it("keeps ?claim in the post-auth redirect", () => {
    expect(claimAwareRedirect(token)).toBe(`/get-started?claim=${token}`);
    expect(isSafeRedirect(claimAwareRedirect(token))).toBe(true);
  });

  it("falls back to /get-started without a valid token", () => {
    expect(claimAwareRedirect(null)).toBe("/get-started");
    expect(claimAwareRedirect(undefined)).toBe("/get-started");
    expect(claimAwareRedirect("short")).toBe("/get-started");
    expect(claimAwareRedirect("abcdefghij0123456789&next=//evil")).toBe("/get-started");
  });

  it("isSafeRedirect only allows same-site paths", () => {
    expect(isSafeRedirect("/app")).toBe(true);
    expect(isSafeRedirect("/get-started?claim=abc")).toBe(true);
    expect(isSafeRedirect("//evil")).toBe(false);
    expect(isSafeRedirect("//evil.com/app")).toBe(false);
    expect(isSafeRedirect("/\\evil")).toBe(false);
    expect(isSafeRedirect("/\\\\evil.com")).toBe(false);
    expect(isSafeRedirect("https://evil.com")).toBe(false);
    expect(isSafeRedirect("javascript:alert(1)")).toBe(false);
    expect(isSafeRedirect("/javascript:alert(1)")).toBe(false);
    expect(isSafeRedirect("/\tevil")).toBe(false);
    expect(isSafeRedirect("app")).toBe(false);
    expect(isSafeRedirect(null)).toBe(false);
  });

  it("get-started and auth carry the full redirect", () => {
    const getStarted = readFileSync("src/routes/get-started.tsx", "utf8");
    expect(getStarted).toContain('redirect: claimAwareRedirect(claimToken)');
    expect(getStarted).not.toContain('redirect: "/get-started"');
    const auth = readFileSync("src/routes/auth.tsx", "utf8");
    expect(auth).toContain("navigate({ href: redirect, replace: true })");
    expect(auth).toContain("isSafeRedirect(redirect)");
    // Confirmation and magic links come back through /auth, which saves the
    // profile and then continues signed in to the carried redirect or /app.
    expect(auth).toContain("emailRedirectTo: authEmailRedirectTo(window.location.origin, redirect)");
    expect(auth).not.toContain("emailRedirectTo: `${window.location.origin}/auth${redirect");
  });

  it("a logged-out Pay click resumes checkout after sign-up", () => {
    expect(checkoutResumeRedirect(null)).toBe("/get-started?pay=now");
    expect(checkoutResumeRedirect(token)).toBe(`/get-started?claim=${token}&pay=now`);
    expect(isSafeRedirect(checkoutResumeRedirect(token))).toBe(true);
    const getStarted = readFileSync("src/routes/get-started.tsx", "utf8");
    const start = getStarted.indexOf("async function startPayment()");
    const guard = getStarted.indexOf("if (!signedIn)", start);
    expect(guard).toBeGreaterThan(start);
    expect(guard).toBeLessThan(getStarted.indexOf("ensureWorkspace()", start));
    expect(getStarted).toContain("redirect: checkoutResumeRedirect(claimToken)");
    expect(getStarted).toContain('search["pay"] === "now"');
  });

  it("email confirmation returns through /auth with the redirect intact", () => {
    const origin = "https://revora.example";
    expect(authEmailRedirectTo(origin, "/get-started?claim=abcDEF1234567890_-")).toBe(
      `${origin}/auth?redirect=${encodeURIComponent("/get-started?claim=abcDEF1234567890_-")}`,
    );
    expect(authEmailRedirectTo(origin, "/get-started?pay=now")).toBe(
      `${origin}/auth?redirect=%2Fget-started%3Fpay%3Dnow`,
    );
    expect(authEmailRedirectTo(`${origin}/`, "/app")).toBe(`${origin}/auth?redirect=%2Fapp`);
    expect(authEmailRedirectTo(origin, undefined)).toBe(`${origin}/auth`);
    expect(authEmailRedirectTo(origin, "//evil.com")).toBe(`${origin}/auth`);
    expect(authEmailRedirectTo(origin, "https://evil.com")).toBe(`${origin}/auth`);
  });

  it("the claim bar names the free trial and needs no card", () => {
    const bar = readFileSync("src/components/site/ProspectClaimBar.tsx", "utf8");
    expect(bar).toContain("Claim your website — start free trial");
    expect(bar).toContain("{`${GROWTH_SYSTEM.fullAccessWindow} free, no card needed`}");
    expect(bar).toMatch(/h-11 w-full[^"]*sm:w-auto/);
  });
});

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
