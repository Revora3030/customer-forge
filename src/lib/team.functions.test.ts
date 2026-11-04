/**
 * Invitation role guard: invitations are written and accepted with the service
 * role, which the database membership trigger lets through, so the server
 * functions must apply the same "only an owner can grant admin" rule.
 */
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const MANAGER = "33333333-3333-4333-8333-333333333333";
const INVITEE = "44444444-4444-4444-8444-444444444444";
const INVITE_ID = "55555555-5555-4555-8555-555555555555";
const TOKEN = "ab".repeat(24);
const INVITEE_EMAIL = "new@example.com";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  db: {} as Record<string, Array<Record<string, unknown>>>,
  writes: [] as Array<{ table: string; op: string; values: unknown }>,
  sent: [] as unknown[],
}));

function table(name: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: { kind: string; values: unknown } | null = null;
  const rows = () => (h.db[name] ?? []).filter((r) => filters.every((f) => f(r)));
  const finish = () => {
    if (op) h.writes.push({ table: name, op: op.kind, values: op.values });
    if (op?.kind === "insert") return { id: "new-id" };
    return rows()[0] ?? null;
  };
  const b: Record<string, unknown> = {
    select: () => b,
    order: () => b,
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
    update: (values: unknown) => ((op = { kind: "update", values }), b),
    insert: (values: unknown) => ((op = { kind: "insert", values }), b),
    maybeSingle: async () => ({ data: finish(), error: null }),
    single: async () => ({ data: finish(), error: null }),
    then: (res: (v: unknown) => unknown) =>
      Promise.resolve({ data: (finish(), rows()), error: null }).then(res),
  };
  return b;
}

vi.mock("@tanstack/react-start", () => {
  const builder = () => {
    let validate: (x: unknown) => unknown = (x) => x;
    const b = {
      middleware: () => b,
      validator: (fn: (x: unknown) => unknown) => ((validate = fn), b),
      handler: (fn: (a: unknown) => unknown) => (arg: { data?: unknown; context?: unknown }) =>
        fn({ data: validate(arg?.data), context: arg?.context }),
    };
    return b;
  };
  return { createServerFn: () => builder() };
});
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (name: string) => table(name),
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: {
            user:
              id === INVITEE
                ? { id, email: INVITEE_EMAIL, email_confirmed_at: "2026-11-01T00:00:00Z" }
                : null,
          },
        }),
      },
    },
  },
}));
vi.mock("@/lib/email-templates/send-email", () => ({
  sendTemplateEmail: async (...args: unknown[]) => (h.sent.push(args), { sent: true }),
}));

/** Same "lookup" view the other server-function tests use (real handlers, no RPC stubs). */
const TEAM_FNS_PATH = "@/lib/team.functions?server-fn-module-lookup";
const fns = async () =>
  (await import(/* @vite-ignore */ TEAM_FNS_PATH)) as typeof import("./team.functions");

type Fn = (arg: { data: unknown; context: unknown }) => Promise<Record<string, unknown>>;
const ctx = (userId: string, email?: string) => ({
  supabase: { from: (n: string) => table(n) },
  userId,
  claims: { sub: userId, email },
});
const call = (fn: unknown, data: unknown, context: unknown) => (fn as Fn)({ data, context });

const membership = (user_id: string, role: string) => ({ organization_id: ORG, user_id, role });

beforeEach(() => {
  h.writes.length = 0;
  h.sent.length = 0;
  h.db["memberships"] = [
    membership(OWNER, "owner"),
    membership(ADMIN, "admin"),
    membership(MANAGER, "manager"),
  ];
  h.db["organizations"] = [{ id: ORG, name: "Acme Roofing" }];
  h.db["profiles"] = [];
  h.db["team_invitations"] = [];
});

describe("rolesGrantableBy", () => {
  it("mirrors the database role guard", async () => {
    const { rolesGrantableBy, canGrantRole } = await fns();
    expect(rolesGrantableBy("owner")).toEqual(["admin", "manager", "staff", "viewer"]);
    expect(rolesGrantableBy("admin")).toEqual(["manager", "staff", "viewer"]);
    for (const role of ["manager", "staff", "viewer", null, undefined, ""]) {
      expect(rolesGrantableBy(role)).toEqual([]);
    }
    expect(canGrantRole("admin", "admin")).toBe(false);
    expect(canGrantRole("admin", "owner")).toBe(false);
    expect(canGrantRole("owner", "owner")).toBe(false);
    expect(canGrantRole("owner", "admin")).toBe(true);
  });
});

describe("createTeamInvitation", () => {
  const input = (role: string) => ({
    organizationId: ORG,
    email: INVITEE_EMAIL,
    role,
    appUrl: "https://revoragrowthsystems.com/app/settings",
  });

  it("refuses an admin inviting another admin, before any write or email", async () => {
    const { createTeamInvitation } = await fns();
    const result = await call(createTeamInvitation, input("admin"), ctx(ADMIN));
    expect(result).toEqual({ error: "Only the workspace owner can invite an admin." });
    expect(h.writes).toEqual([]);
    expect(h.sent).toEqual([]);
  });

  it("lets an admin invite below admin", async () => {
    const { createTeamInvitation } = await fns();
    const result = await call(createTeamInvitation, input("staff"), ctx(ADMIN));
    expect(result).toMatchObject({ ok: true, email: INVITEE_EMAIL });
    expect(h.writes.find((w) => w.op === "insert")?.values).toMatchObject({
      role: "staff",
      invited_by: ADMIN,
    });
  });

  it("lets the owner invite an admin", async () => {
    const { createTeamInvitation } = await fns();
    const result = await call(createTeamInvitation, input("admin"), ctx(OWNER));
    expect(result).toMatchObject({ ok: true });
    expect(h.writes.find((w) => w.op === "insert")?.values).toMatchObject({ role: "admin" });
  });

  it("still refuses managers entirely", async () => {
    const { createTeamInvitation } = await fns();
    const result = await call(createTeamInvitation, input("viewer"), ctx(MANAGER));
    expect(result).toEqual({ error: "Only workspace owners and admins can manage the team." });
    expect(h.writes).toEqual([]);
  });
});

describe("acceptTeamInvitation", () => {
  const tokenHash = createHash("sha256").update(TOKEN).digest("hex");
  const seedInvite = (role: string, invited_by: string | null) => {
    h.db["team_invitations"] = [
      {
        id: INVITE_ID,
        organization_id: ORG,
        email: INVITEE_EMAIL,
        role,
        invited_by,
        token_hash: tokenHash,
        expires_at: "2099-01-01T00:00:00Z",
        accepted_at: null,
        revoked_at: null,
      },
    ];
  };
  const accept = async () => {
    const { acceptTeamInvitation } = await fns();
    return call(acceptTeamInvitation, { token: TOKEN }, ctx(INVITEE, INVITEE_EMAIL));
  };
  const stale = {
    error: "This invitation is no longer valid. Ask the workspace owner to send a new one.",
  };

  it("rejects an admin-role invite that an admin minted, without claiming it", async () => {
    seedInvite("admin", ADMIN);
    expect(await accept()).toEqual(stale);
    expect(h.writes).toEqual([]);
  });

  it("rejects an invite whose inviter has since been demoted", async () => {
    seedInvite("staff", MANAGER);
    expect(await accept()).toEqual(stale);
    expect(h.writes).toEqual([]);
  });

  it("rejects an invite whose inviter has left the workspace or was deleted", async () => {
    seedInvite("staff", "66666666-6666-4666-8666-666666666666");
    expect(await accept()).toEqual(stale);
    seedInvite("staff", null);
    expect(await accept()).toEqual(stale);
    expect(h.writes).toEqual([]);
  });

  it("accepts an owner's admin invite and an admin's staff invite", async () => {
    seedInvite("admin", OWNER);
    expect(await accept()).toMatchObject({ ok: true, organizationId: ORG });
    expect(h.writes.find((w) => w.table === "memberships")?.values).toMatchObject({
      user_id: INVITEE,
      role: "admin",
    });

    h.writes.length = 0;
    seedInvite("staff", ADMIN);
    expect(await accept()).toMatchObject({ ok: true });
    expect(h.writes.find((w) => w.table === "memberships")?.values).toMatchObject({
      role: "staff",
    });
  });
  const joinAs = (role: string) =>
    (h.db["memberships"] ??= []).push({ id: "m-invitee", ...membership(INVITEE, role) });
  const claimed = () =>
    h.writes.some(
      (w) =>
        w.table === "team_invitations" && (w.values as Row | null)?.["accepted_at"] !== undefined,
    );

  it("refuses an existing member's same-role invite without spending it", async () => {
    joinAs("staff");
    seedInvite("staff", ADMIN);
    expect(await accept()).toEqual({
      error:
        "You're already on this team as staff member. This invitation would not give you more access, so it was not used.",
    });
    expect(h.writes).toEqual([]);
  });

  it("never demotes: a lower-role invite is refused before the claim", async () => {
    joinAs("manager");
    seedInvite("viewer", OWNER);
    const result = await accept();
    expect(result["error"]).toMatch(/already on this team as manager/);
    expect(claimed()).toBe(false);
    expect(h.writes.some((w) => w.table === "memberships")).toBe(false);

    h.db["memberships"] = (h.db["memberships"] ?? []).filter((m) => m["user_id"] !== INVITEE);
    joinAs("admin");
    seedInvite("manager", OWNER);
    expect((await accept())["error"]).toMatch(/already on this team as admin/);
    expect(h.writes).toEqual([]);
  });

  it("refuses the workspace owner accepting any invite to their own workspace", async () => {
    joinAs("owner");
    seedInvite("admin", OWNER);
    expect((await accept())["error"]).toMatch(/already on this team as owner/);
    expect(h.writes).toEqual([]);
  });

  it("raises an existing member's role when the invite is higher and still grantable", async () => {
    joinAs("viewer");
    seedInvite("manager", ADMIN);
    expect(await accept()).toMatchObject({ ok: true, organizationId: ORG });
    const roleWrite = h.writes.find((w) => w.table === "memberships");
    expect(roleWrite).toEqual({ table: "memberships", op: "update", values: { role: "manager" } });
    expect(h.writes.some((w) => w.table === "memberships" && w.op === "insert")).toBe(false);
  });

  it("checks the inviter before upgrading: an admin's admin invite can't promote a member", async () => {
    joinAs("staff");
    seedInvite("admin", ADMIN);
    expect(await accept()).toEqual(stale);
    expect(h.writes).toEqual([]);
  });
});

describe("revokeTeamInvitation", () => {
  const seed = (role: string) => {
    h.db["team_invitations"] = [
      {
        id: INVITE_ID,
        organization_id: ORG,
        email: INVITEE_EMAIL,
        role,
        invited_by: OWNER,
        accepted_at: null,
        revoked_at: null,
      },
    ];
  };
  const revoke = async (actor: string) => {
    const { revokeTeamInvitation } = await fns();
    return call(revokeTeamInvitation, { organizationId: ORG, invitationId: INVITE_ID }, ctx(actor));
  };

  it("lets only the owner cancel an admin invite", async () => {
    seed("admin");
    expect(await revoke(ADMIN)).toEqual({
      error: "Only the workspace owner can cancel an admin invite.",
    });
    expect(h.writes).toEqual([]);
    expect(await revoke(OWNER)).toEqual({ ok: true });
    expect(h.writes.find((w) => w.table === "team_invitations")?.values).toHaveProperty(
      "revoked_at",
    );
  });

  it("still lets an admin cancel invites below admin, and never lets a manager", async () => {
    seed("staff");
    expect(await revoke(ADMIN)).toEqual({ ok: true });
    h.writes.length = 0;
    expect(await revoke(MANAGER)).toEqual({
      error: "Only workspace owners and admins can manage the team.",
    });
    expect(h.writes).toEqual([]);
  });

  it("canRevokeInvite and isRoleUpgrade follow the role order", async () => {
    const { canRevokeInvite, isRoleUpgrade } = await fns();
    expect(canRevokeInvite("owner", "admin")).toBe(true);
    expect(canRevokeInvite("admin", "admin")).toBe(false);
    expect(canRevokeInvite("admin", "viewer")).toBe(true);
    expect(canRevokeInvite("manager", "viewer")).toBe(false);
    expect(isRoleUpgrade("viewer", "staff")).toBe(true);
    expect(isRoleUpgrade("staff", "staff")).toBe(false);
    expect(isRoleUpgrade("admin", "manager")).toBe(false);
    expect(isRoleUpgrade("owner", "admin")).toBe(false);
    expect(isRoleUpgrade(null, "viewer")).toBe(true);
  });
});
