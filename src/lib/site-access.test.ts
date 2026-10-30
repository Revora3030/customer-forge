import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLATFORM_OWNER_ORG_ID } from "@/lib/platform-owner";
import { siteAccess } from "@/lib/site-access";

const day = 86_400_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const base = { id: "00000000-0000-0000-0000-000000000001", is_demo: false, is_suspended: false, setup_paid_at: null, setup_payment_status: "unpaid" };

describe("trial publishing", () => {
  it("lets a trial workspace publish on its Revora address, not a custom domain", () => {
    const access = siteAccess({ ...base, created_at: iso(-day), trial_ends_at: iso(2 * day) });
    expect(access).toMatchObject({ live: true, domainUnlocked: false, reason: "trial" });
    expect(access.offlineAt).not.toBeNull();
  });

  it("takes the site offline when the trial ends unpaid", () => {
    expect(siteAccess({ ...base, created_at: iso(-10 * day), trial_ends_at: iso(-7 * day) })).toMatchObject({
      live: false,
      reason: "setup_required",
    });
  });

  it("brings it back once the setup is paid", () => {
    const expired = { ...base, created_at: iso(-10 * day), trial_ends_at: iso(-7 * day) };
    expect(siteAccess({ ...expired, setup_paid_at: iso(-1000) })).toMatchObject({ live: true, domainUnlocked: true, reason: "paid" });
    expect(siteAccess({ ...expired, setup_payment_status: "paid" }).live).toBe(true);
  });

  it("keeps demos and Revora's own workspace live, and suspended workspaces offline", () => {
    const expired = { ...base, created_at: iso(-10 * day), trial_ends_at: iso(-7 * day) };
    expect(siteAccess({ ...expired, is_demo: true }).live).toBe(true);
    expect(siteAccess({ ...expired, id: PLATFORM_OWNER_ORG_ID }).live).toBe(true);
    expect(siteAccess({ ...base, setup_paid_at: iso(0), is_suspended: true }).live).toBe(false);
    expect(siteAccess(null).live).toBe(false);
  });
});

describe("canceled subscription grace period", () => {
  it("takes a paid site offline once its grace period is over, except demos and Revora's own", () => {
    const paid = { ...base, setup_paid_at: iso(-90 * day), setup_payment_status: "paid", hosting_offline_at: iso(-day) };
    expect(siteAccess(paid)).toMatchObject({ live: false, domainUnlocked: false, reason: "hosting_ended" });
    expect(siteAccess({ ...paid, hosting_offline_at: null })).toMatchObject({ live: true, reason: "paid" });
    expect(siteAccess({ ...paid, is_demo: true }).live).toBe(true);
    expect(siteAccess({ ...paid, id: PLATFORM_OWNER_ORG_ID }).live).toBe(true);
  });
});

describe("database guard matches the app rule", () => {
  const sql = readFileSync("supabase/migrations/20261016120000_trial_publishing.sql", "utf8");
  it("allows going live during the trial but keeps domains paid-only", () => {
    expect(sql).toMatch(/IF domain_live AND NOT private\.production_unlocked\(NEW\.organization_id\)/);
    expect(sql).toMatch(/IF going_live AND NOT private\.site_live_allowed\(NEW\.organization_id\)/);
    expect(sql).toContain("REVOKE ALL ON FUNCTION private.site_live_allowed(uuid) FROM PUBLIC;");
    expect(sql).toContain("created_at + interval '3 days'");
  });
});
