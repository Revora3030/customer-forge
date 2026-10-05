/**
 * Database-enforced invariants (migration 20261005120000):
 *  - one active first build per workspace, with the app returning the running
 *    job when it loses the race instead of failing or queueing a duplicate;
 *  - super_admin can only be held by revorabusiness0@gmail.com;
 *  - customer lead alerts go only to the workspace's own inbox, never to the
 *    platform owner by default.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isActiveBuildConflict } from "@/lib/site-engine.functions";
import { alertRecipient } from "@/lib/notifications.functions";
import { PLATFORM_OWNER_EMAIL } from "@/lib/platform-owner";

const migration = readFileSync("supabase/migrations/20261005120000_build_and_admin_invariants.sql", "utf8");
const engine = readFileSync("src/lib/site-engine.functions.ts", "utf8");

describe("one active build per workspace", () => {
  it("is enforced by a partial unique index on active statuses", () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS generation_jobs_one_active_per_org\s+ON public\.generation_jobs \(organization_id\)\s+WHERE status IN \('queued', 'processing'\);/,
    );
  });

  it("resolves pre-existing duplicates without deleting rows", () => {
    expect(migration).toContain("UPDATE public.generation_jobs AS j");
    expect(migration).toContain("SET status = 'failed'");
    expect(migration).not.toMatch(/DELETE FROM public\.generation_jobs/i);
  });

  it("classifies only unique violations as a lost race", () => {
    expect(isActiveBuildConflict({ code: "23505", message: 'duplicate key value violates unique constraint "generation_jobs_one_active_per_org"' })).toBe(true);
    expect(isActiveBuildConflict({ code: "23505" })).toBe(true);
    expect(isActiveBuildConflict({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isActiveBuildConflict({ code: "23503", message: "foreign key" })).toBe(false);
    expect(isActiveBuildConflict(null)).toBe(false);
  });

  it("returns the running job after a lost race and keeps the fresh-rebuild guard", () => {
    const start = engine.indexOf("if (isActiveBuildConflict(error))");
    expect(start).toBeGreaterThan(0);
    const branch = engine.slice(start, start + 900);
    expect(branch).toContain('.in("status", ["queued", "processing"])');
    expect(branch).toContain("A build is already running");
    expect(branch).toContain("jobId: running.id");
  });

  it("keeps entitlement and tenant checks ahead of the insert", () => {
    const entitled = engine.indexOf("assertOrgEntitled(supabase, orgId)");
    const insert = engine.indexOf('.from("generation_jobs")\n      .insert(');
    expect(entitled).toBeGreaterThan(0);
    expect(insert).toBeGreaterThan(entitled);
  });
});

describe("super_admin is bound to the platform owner", () => {
  it("rejects super_admin for any account whose email is not the owner's", () => {
    expect(migration).toContain("CREATE TRIGGER enforce_super_admin_owner");
    expect(migration).toContain("BEFORE INSERT OR UPDATE ON public.user_roles");
    expect(migration).toContain(`IS DISTINCT FROM '${PLATFORM_OWNER_EMAIL}'`);
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION private\.enforce_super_admin_owner\(\) FROM PUBLIC, anon, authenticated;/);
  });

  it("matches the single owner email used by the application", () => {
    expect(PLATFORM_OWNER_EMAIL).toBe("revorabusiness0@gmail.com");
  });
});

describe("customer lead alerts stay in the customer's workspace", () => {
  it("uses only the workspace's own inboxes", () => {
    expect(alertRecipient({ notification_email: "alerts@acme.test", email: "hi@acme.test" })).toBe("alerts@acme.test");
    expect(alertRecipient({ email: "hi@acme.test" })).toBe("hi@acme.test");
    expect(alertRecipient({ owner_email: "owner@acme.test" })).toBe("owner@acme.test");
  });

  it("never falls back to the platform owner when the workspace has no inbox", () => {
    expect(alertRecipient({})).toBeNull();
    expect(alertRecipient({ notification_email: "not-an-email" })).toBeNull();
    expect(alertRecipient({ email: "hi@acme.test", notify_on_lead: false })).toBeNull();
  });

  it("public lead capture routes alerts through the workspace profile only", () => {
    const publicSite = readFileSync("src/lib/public-site.functions.ts", "utf8");
    expect(publicSite).toContain("const alertEmail = alertRecipient((profile ?? {}) as Record<string, never>);");
    expect(publicSite).not.toContain("PLATFORM_OWNER_EMAIL");
    expect(publicSite).not.toContain("revorabusiness0@gmail.com");
  });
});
