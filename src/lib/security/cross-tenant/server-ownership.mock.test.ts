/**
 * Behavioural ownership tests with mocks: two tenants, a fake row level
 * security client for the caller and a recording fake for the service role.
 *
 * They run the REAL handlers of the server functions and show that when
 * tenant A's owner (or an unrelated signed-in user) sends tenant B's id, the
 * function refuses BEFORE it touches the service-role client.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "22222222-2222-4222-8222-222222222222";
const STAFF_A = "33333333-3333-4333-8333-333333333333";
const SUPER = "44444444-4444-4444-8444-444444444444";
const NOBODY = "55555555-5555-4555-8555-555555555555";
const BACKUP_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

type Row = Record<string, unknown>;
const DB: Record<string, Row[]> = {};

/** Minimal PostgREST-like builder over DB; filters are exact-match eq/is. */
function table(name: string, onUse?: (name: string) => void) {
  onUse?.(name);
  const filters: Array<(r: Row) => boolean> = [];
  let limit = Infinity;
  const rows = () => (DB[name] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, limit);
  const b: Record<string, unknown> = {
    select: () => b,
    order: () => b,
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
    gt: () => b,
    in: () => b,
    limit: (n: number) => ((limit = n), b),
    update: () => b,
    insert: () => b,
    delete: () => b,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    single: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(res),
  };
  return b;
}

const h = vi.hoisted(() => ({ adminTouched: [] as string[], restore: vi.fn(), backup: vi.fn(), prune: vi.fn() }));

vi.mock("@tanstack/react-start", () => {
  const builder = () => {
    let validate: (x: unknown) => unknown = (x) => x;
    const b = {
      middleware: () => b,
      validator: (fn: (x: unknown) => unknown) => ((validate = fn), b),
      inputValidator: (fn: (x: unknown) => unknown) => ((validate = fn), b),
      handler: (...args: unknown[]) => {
        const fn = args.at(-1) as (a: unknown) => unknown;
        return (arg: { data?: unknown; context?: unknown }) => fn({ data: validate(arg?.data), context: arg?.context });
      },
    };
    return b;
  };
  return { createServerFn: () => builder() };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (name: string) => table(name, (n) => h.adminTouched.push(`from:${n}`)),
    rpc: (name: string) => (h.adminTouched.push(`rpc:${name}`), Promise.resolve({ data: null, error: null })),
    auth: { admin: { getUserById: () => (h.adminTouched.push("auth.admin"), Promise.resolve({ data: null })) } },
  },
}));
vi.mock("@/lib/backup.server", () => ({
  createBackup: (...a: unknown[]) => (h.backup(...a), Promise.resolve({ id: "new" })),
  pruneBackups: (...a: unknown[]) => (h.prune(...a), Promise.resolve()),
  restoreBackup: (...a: unknown[]) => (h.restore(...a), Promise.resolve({ ok: true })),
}));

/** The app's own tests import this "lookup" view: the plain SSR import swaps handlers for RPC stubs. */
const loadFns = async (name: string) => {
  const path = `@/lib/${name}.functions?server-fn-module-lookup`;
  return (await import(/* @vite-ignore */ path)) as Record<string, unknown>;
};

/** The caller's own client: in real life RLS filters; here we model the same visibility. */
const asUser = (userId: string) => ({
  supabase: { from: (n: string) => table(n) },
  userId,
  claims: { sub: userId },
});

type Fn = (arg: { data: unknown; context: unknown }) => Promise<unknown>;
const attempt = async (fn: unknown, data: unknown, userId: string) => {
  try {
    return { ok: true as const, value: await (fn as Fn)({ data, context: asUser(userId) }) };
  } catch (error) {
    return { ok: false as const, error: String((error as Error).message) };
  }
};

beforeEach(() => {
  h.adminTouched.length = 0;
  h.restore.mockClear();
  h.backup.mockClear();
  h.prune.mockClear();
  DB["memberships"] = [
    { organization_id: ORG_A, user_id: OWNER_A, role: "owner" },
    { organization_id: ORG_A, user_id: STAFF_A, role: "staff" },
    { organization_id: ORG_B, user_id: OWNER_B, role: "owner" },
  ];
  DB["user_roles"] = [{ user_id: SUPER, role: "super_admin" }];
  DB["support_sessions"] = [];
  DB["data_backups"] = [{ id: BACKUP_B, organization_id: ORG_B, kind: "manual", row_counts: {}, size_bytes: 1 }];
  DB["organizations"] = [
    { id: ORG_A, name: "A" },
    { id: ORG_B, name: "B" },
  ];
});

describe("requireOrgRole / orgRole (the shared guard)", async () => {
  const { requireOrgRole, roleAtLeast } = await import("@/lib/org-authz.server");
  const supa = () => asUser(OWNER_A).supabase as never;

  it("lets a member through and returns the validated id", async () => {
    await expect(requireOrgRole(supa(), ORG_A, OWNER_A, "owner")).resolves.toBe(ORG_A);
  });
  it("denies tenant A's owner on tenant B", async () => {
    await expect(requireOrgRole(supa(), ORG_B, OWNER_A, "viewer")).rejects.toThrow(/permission/i);
  });
  it("denies a signed-in stranger, an empty user id and a malformed org id", async () => {
    await expect(requireOrgRole(supa(), ORG_A, NOBODY, "viewer")).rejects.toThrow();
    await expect(requireOrgRole(supa(), ORG_A, "", "viewer")).rejects.toThrow();
    await expect(requireOrgRole(supa(), "' or 1=1 --", OWNER_A, "viewer")).rejects.toThrow();
  });
  it("enforces the role ladder inside the tenant", async () => {
    await expect(requireOrgRole(supa(), ORG_A, STAFF_A, "manager")).rejects.toThrow();
    await expect(requireOrgRole(supa(), ORG_A, STAFF_A, "staff")).resolves.toBe(ORG_A);
    expect(roleAtLeast("viewer", "manager")).toBe(false);
    expect(roleAtLeast(null, "viewer")).toBe(false);
    expect(roleAtLeast("garbage", "viewer")).toBe(false);
  });
  it("does not reveal whether a workspace exists (same error for real and unknown ids)", async () => {
    const real = await requireOrgRole(supa(), ORG_B, OWNER_A, "viewer").catch((e: Error) => e.message);
    const unknown = await requireOrgRole(supa(), "99999999-9999-4999-8999-999999999999", OWNER_A, "viewer").catch((e: Error) => e.message);
    expect(real).toBe(unknown);
  });
  it("a super admin needs an open support session for THAT workspace; being super admin alone is not enough", async () => {
    await expect(requireOrgRole(asUser(SUPER).supabase as never, ORG_B, SUPER, "viewer")).rejects.toThrow();
  });
});

describe("backup functions: tenant A's owner against tenant B", () => {
  it("listBackups refuses B's id and never touches the service role", async () => {
    const { listBackups } = await loadFns("backup");
    const r = await attempt(listBackups, { organizationId: ORG_B }, OWNER_A);
    expect(r).toMatchObject({ ok: false, error: "Forbidden" });
    expect(h.adminTouched).toEqual([]);
  });
  it("runBackup refuses B's id, creates nothing", async () => {
    const { runBackup } = await loadFns("backup");
    expect(await attempt(runBackup, { organizationId: ORG_B }, OWNER_A)).toMatchObject({ ok: false, error: "Forbidden" });
    expect(h.backup).not.toHaveBeenCalled();
    expect(h.adminTouched).toEqual([]);
  });
  it("restoreFromBackup checks the backup's REAL organization, so a guessed backup id from another tenant is refused", async () => {
    const { restoreFromBackup } = await loadFns("backup");
    const r = await attempt(restoreFromBackup, { backupId: BACKUP_B, confirm: "RESTORE" }, OWNER_A);
    expect(r).toMatchObject({ ok: false, error: "Forbidden" });
    expect(h.restore).not.toHaveBeenCalled();
  });
  it("a signed-in user with no workspace and a staff member are refused too", async () => {
    const { listBackups } = await loadFns("backup");
    expect(await attempt(listBackups, { organizationId: ORG_A }, NOBODY)).toMatchObject({ ok: false });
    expect(await attempt(listBackups, { organizationId: ORG_A }, STAFF_A)).toMatchObject({ ok: false });
    expect(h.adminTouched).toEqual([]);
  });
  it("rejects non-uuid ids at validation", async () => {
    const { listBackups } = await loadFns("backup");
    expect(await attempt(listBackups, { organizationId: "nope" }, OWNER_A)).toMatchObject({ ok: false, error: expect.stringMatching(/Invalid/) });
  });
  it("positive control: the owner of the workspace is allowed on their own", async () => {
    const { listBackups } = await loadFns("backup");
    const r = await attempt(listBackups, { organizationId: ORG_A }, OWNER_A);
    expect(r.ok).toBe(true);
    expect(h.adminTouched).toContain("from:data_backups");
  });
  it("positive control: the platform super admin may restore any workspace's backup", async () => {
    const { restoreFromBackup } = await loadFns("backup");
    const r = await attempt(restoreFromBackup, { backupId: BACKUP_B, confirm: "RESTORE" }, SUPER);
    expect(r.ok).toBe(true);
    expect(h.restore).toHaveBeenCalledTimes(1);
  });
});

describe("team and portal functions", () => {
  const settle = async (p: Promise<{ ok: boolean; value?: unknown; error?: string }>) => {
    const r = await p;
    // Denied for the RIGHT reason: an authorization error, not a mock or validation failure.
    const authz = /only workspace|permission|access|forbidden/i;
    if (!r.ok) return authz.test(r.error ?? "");
    const v = r.value as { error?: unknown } | null;
    return typeof v?.error === "string" && authz.test(v.error);
  };

  it("revokeTeamInvitation: tenant A's owner cannot revoke tenant B's invitation", async () => {
    const { revokeTeamInvitation } = await loadFns("team");
    const inv = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    expect(await settle(attempt(revokeTeamInvitation, { organizationId: ORG_B, invitationId: inv }, OWNER_A))).toBe(true);
    expect(h.adminTouched).toEqual([]);
  });

  it("revokeTeamInvitation: a staff member of the right tenant cannot manage the team", async () => {
    const { revokeTeamInvitation } = await loadFns("team");
    const inv = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    expect(await settle(attempt(revokeTeamInvitation, { organizationId: ORG_A, invitationId: inv }, STAFF_A))).toBe(true);
    expect(h.adminTouched).toEqual([]);
  });

  it("revokeTeamInvitation: positive control for the real owner", async () => {
    const { revokeTeamInvitation } = await loadFns("team");
    const inv = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    expect(await settle(attempt(revokeTeamInvitation, { organizationId: ORG_A, invitationId: inv }, OWNER_A))).toBe(false);
    expect(h.adminTouched).toContain("from:team_invitations");
  });

  it("setPortalCode: tenant A's owner cannot rotate tenant B's join code", async () => {
    const { setPortalCode } = await loadFns("portal");
    expect(await settle(attempt(setPortalCode, { organizationId: ORG_B, enabled: true }, OWNER_A))).toBe(true);
    expect(h.adminTouched).toEqual([]);
  });
});

describe("admin routes: a non-admin is refused", () => {
  it("assertSuperAdmin rejects a signed-in non-admin, including a tenant owner", async () => {
    const { assertSuperAdmin } = await import("@/lib/admin.server");
    await expect(assertSuperAdmin(asUser(OWNER_A).supabase as never, OWNER_A)).rejects.toThrow("Forbidden");
    await expect(assertSuperAdmin(asUser(NOBODY).supabase as never, NOBODY)).rejects.toThrow("Forbidden");
    await expect(assertSuperAdmin(asUser(SUPER).supabase as never, SUPER)).resolves.toBe(true);
  });

  it("getSiteDesign / saveSiteDesign (admin console) refuse a tenant owner for ANY organization, including their own", async () => {
    const mod = await import("@/lib/ai/command-center.functions");
    for (const org of [ORG_A, ORG_B]) {
      expect(await attempt(mod.getSiteDesign, { organizationId: org }, OWNER_A)).toMatchObject({ ok: false });
      expect(await attempt(mod.saveSiteDesign, { organizationId: org, colors: {}, tokens: {} }, OWNER_A)).toMatchObject({ ok: false });
    }
    expect(h.adminTouched).toEqual([]);
  });
});
