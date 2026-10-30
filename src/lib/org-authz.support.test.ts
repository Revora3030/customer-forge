/**
 * Support-mode authorization: a platform super admin inside an open, audited
 * support session acts as that workspace's admin (mirroring the database's
 * `private.has_support_access`), and nobody else gains anything.
 */
import { describe, expect, it } from "vitest";
import {
  hasActiveSupportSession,
  orgRole,
  requireOrgRole,
  SUPPORT_SESSION_MAX_AGE_MS,
} from "@/lib/org-authz.server";

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Tables = {
  memberships?: Array<Record<string, unknown>>;
  user_roles?: Array<Record<string, unknown>>;
  support_sessions?: Array<Record<string, unknown>>;
};

/** A stand-in for the caller's Supabase client that honours eq/is/gt filters. */
function client(tables: Tables, failing: Array<keyof Tables> = []) {
  return {
    from(table: keyof Tables) {
      const tests: Array<(row: Record<string, unknown>) => boolean> = [];
      const rows = () => (tables[table] ?? []).filter((row) => tests.every((test) => test(row)));
      const result = (data: unknown) =>
        failing.includes(table) ? { data: null, error: { message: "boom" } } : { data, error: null };
      const builder = {
        select: () => builder,
        eq: (col: string, value: unknown) => {
          tests.push((row) => row[col] === value);
          return builder;
        },
        is: (col: string, value: unknown) => {
          tests.push((row) => (row[col] ?? null) === value);
          return builder;
        },
        gt: (col: string, value: string) => {
          tests.push((row) => String(row[col]) > value);
          return builder;
        },
        limit: async (n: number) => result(rows().slice(0, n)),
        maybeSingle: async () => result(rows()[0] ?? null),
      };
      return builder;
    },
  } as never;
}

const recent = () => new Date(Date.now() - 10 * 60 * 1000).toISOString();
const superAdmin = { user_id: ADMIN, role: "super_admin" };
const openSession = (org = ORG_A, admin = ADMIN) => ({
  id: "s1",
  organization_id: org,
  admin_id: admin,
  ended_at: null,
  started_at: recent(),
});

describe("support session access", () => {
  it("lets a super admin in an open support session build (acts as admin)", async () => {
    const supabase = client({ user_roles: [superAdmin], support_sessions: [openSession()] });
    expect(await orgRole(supabase, ORG_A, ADMIN)).toBe("admin");
    await expect(requireOrgRole(supabase, ORG_A, ADMIN, "manager")).resolves.toBe(ORG_A);
    await expect(requireOrgRole(supabase, ORG_A, ADMIN, "admin")).resolves.toBe(ORG_A);
  });

  it("never grants owner-only actions through support", async () => {
    const supabase = client({ user_roles: [superAdmin], support_sessions: [openSession()] });
    await expect(requireOrgRole(supabase, ORG_A, ADMIN, "owner")).rejects.toThrow(/permission/i);
  });

  it("denies a super admin with no support session", async () => {
    const supabase = client({ user_roles: [superAdmin], support_sessions: [] });
    expect(await orgRole(supabase, ORG_A, ADMIN)).toBeNull();
    await expect(requireOrgRole(supabase, ORG_A, ADMIN, "manager")).rejects.toThrow(/permission/i);
  });

  it("denies an ended session", async () => {
    const ended = { ...openSession(), ended_at: new Date().toISOString() };
    const supabase = client({ user_roles: [superAdmin], support_sessions: [ended] });
    await expect(requireOrgRole(supabase, ORG_A, ADMIN, "manager")).rejects.toThrow(/permission/i);
  });

  it("denies a session older than the four-hour support window", async () => {
    const stale = {
      ...openSession(),
      started_at: new Date(Date.now() - SUPPORT_SESSION_MAX_AGE_MS - 60_000).toISOString(),
    };
    const supabase = client({ user_roles: [superAdmin], support_sessions: [stale] });
    await expect(requireOrgRole(supabase, ORG_A, ADMIN, "manager")).rejects.toThrow(/permission/i);
  });

  it("keeps tenant isolation: a session for another workspace grants nothing here", async () => {
    const supabase = client({ user_roles: [superAdmin], support_sessions: [openSession(ORG_B)] });
    await expect(requireOrgRole(supabase, ORG_A, ADMIN, "manager")).rejects.toThrow(/permission/i);
    await expect(requireOrgRole(supabase, ORG_B, ADMIN, "manager")).resolves.toBe(ORG_B);
  });

  it("denies a non-super-admin even with a session row", async () => {
    const supabase = client({ user_roles: [], support_sessions: [openSession(ORG_A, OTHER)] });
    await expect(requireOrgRole(supabase, ORG_A, OTHER, "manager")).rejects.toThrow(/permission/i);
  });

  it("does not let one admin ride on another admin's session", async () => {
    const supabase = client({
      user_roles: [superAdmin, { user_id: OTHER, role: "super_admin" }],
      support_sessions: [openSession(ORG_A, OTHER)],
    });
    await expect(requireOrgRole(supabase, ORG_A, ADMIN, "manager")).rejects.toThrow(/permission/i);
  });

  it("fails closed when either lookup errors", async () => {
    const tables = { user_roles: [superAdmin], support_sessions: [openSession()] };
    expect(await hasActiveSupportSession(client(tables, ["user_roles"]), ORG_A, ADMIN)).toBe(false);
    expect(await hasActiveSupportSession(client(tables, ["support_sessions"]), ORG_A, ADMIN)).toBe(false);
    const throwing = { from: () => { throw new Error("network"); } } as never;
    expect(await hasActiveSupportSession(throwing, ORG_A, ADMIN)).toBe(false);
  });

  it("still prefers a real membership role over support", async () => {
    const supabase = client({
      memberships: [{ organization_id: ORG_A, user_id: ADMIN, role: "owner" }],
      user_roles: [superAdmin],
      support_sessions: [openSession()],
    });
    expect(await orgRole(supabase, ORG_A, ADMIN)).toBe("owner");
  });
});
