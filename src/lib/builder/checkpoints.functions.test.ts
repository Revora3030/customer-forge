import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      middleware: () => chain,
      validator: () => chain,
      handler: (...args: unknown[]) => args.at(-1),
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const mock = vi.hoisted(() => ({ role: "owner" as string | null, publish: vi.fn() }));
vi.mock("@/lib/org-authz.server", () => {
  const LEVEL: Record<string, number> = { viewer: 0, staff: 1, manager: 2, admin: 3, owner: 4 };
  const roleAtLeast = (role: string | null | undefined, min: string) =>
    (LEVEL[String(role ?? "")] ?? -1) >= (LEVEL[min] ?? 0);
  return {
    roleAtLeast,
    orgRole: async () => mock.role,
    requireOrgRole: async (_db: unknown, org: string, _user: string, min: string) => {
      if (!roleAtLeast(mock.role, min))
        throw new Error("You don't have permission to do that in this workspace.");
      return org;
    },
  };
});
vi.mock("@/lib/production.functions", () => ({ publishSiteNow: mock.publish }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => ({
      select: () => ({ in: async () => ({ data: [{ id: USER, full_name: "Adam" }] }) }),
    }),
  },
}));

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "33333333-3333-4333-8333-333333333333";
const vid = (n: number) => `44444444-4444-4444-8444-${String(n).padStart(12, "0")}`;
type Row = Record<string, unknown>;

const page = (heading: string, extra: Row = {}) => ({
  live_format: 1,
  pages: [{ id: "home", title: "Home", sections: [{ id: "s1", kind: "hero", heading }] }],
  ...extra,
});

function db(rows: Row[]) {
  const updates: Row[] = [];
  const client = {
    from() {
      const filters: ((row: Row) => boolean)[] = [];
      let limit = Infinity;
      let pending: Row | null = null;
      const field = (row: Row, key: string) => {
        if (key.startsWith("pages->>")) {
          const value = (row["pages"] as Row | undefined)?.[key.slice(8)];
          return value === undefined ? undefined : String(value);
        }
        return row[key];
      };
      const result = () =>
        rows
          .filter((row) => filters.every((f) => f(row)))
          .sort((a, b) => Number(b["version"]) - Number(a["version"]))
          .slice(0, limit);
      const chain = {
        select: () => chain,
        update: (row: Row) => ((pending = row), chain),
        eq: (key: string, value: unknown) => (
          filters.push((row) => field(row, key) === value),
          chain
        ),
        not: (key: string) => (
          filters.push((row) => row[key] !== null && row[key] !== undefined),
          chain
        ),
        order: () => chain,
        limit: (n: number) => ((limit = n), chain),
        maybeSingle: async () => ({ data: result()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => {
          if (pending) {
            for (const row of result()) Object.assign(row, pending);
            updates.push(pending);
          }
          return resolve({ data: result(), error: null });
        },
      };
      return chain;
    },
  };
  return { client, updates };
}

const published = (n: number, extra: Row = {}) => ({
  id: vid(n),
  organization_id: ORG,
  version: n,
  label: null,
  created_at: `2026-10-${String(n).padStart(2, "0")}T00:00:00Z`,
  published_at: `2026-10-${String(n).padStart(2, "0")}T00:00:00Z`,
  created_by: USER,
  generation: {},
  seo: {},
  pages: page(`Heading ${n}`, extra),
});

type Name = "listCheckpoints" | "updateCheckpoint" | "restoreCheckpoint" | "compareCheckpoint";
// The server-fn module lookup gives the raw handlers (as in site-versions.restore.test.ts).
const call = async (name: Name, data: Row, client: unknown) => {
  const path = "./checkpoints.functions.ts?server-fn-module-lookup";
  const module = await import(/* @vite-ignore */ path);
  const handler = module[name] as (input: unknown) => Promise<unknown>;
  return handler({ data, context: { supabase: client, userId: USER } });
};
const listCheckpoints = "listCheckpoints" as const;
const updateCheckpoint = "updateCheckpoint" as const;
const restoreCheckpoint = "restoreCheckpoint" as const;
const compareCheckpoint = "compareCheckpoint" as const;

beforeEach(() => {
  mock.role = "owner";
  mock.publish.mockReset();
});

describe("listCheckpoints", () => {
  it("returns nothing (not an error) to non-owners", async () => {
    for (const role of ["manager", "staff", "viewer", null]) {
      mock.role = role;
      const { client } = db([published(1)]);
      expect(await call(listCheckpoints, { organizationId: ORG }, client)).toEqual({
        allowed: false,
        checkpoints: [],
      });
    }
  });
  it("lists the newest first with names, pins and the live flag for owners and admins", async () => {
    mock.role = "admin";
    const { client } = db([
      published(1, { checkpoint_name: "Spring", checkpoint_pinned: true }),
      published(2),
      published(3),
    ]);
    const out = (await call(listCheckpoints, { organizationId: ORG }, client)) as {
      allowed: boolean;
      checkpoints: Row[];
    };
    expect(out.allowed).toBe(true);
    expect(out.checkpoints.map((c) => c["version"])).toEqual([3, 2, 1]);
    expect(out.checkpoints[0]).toMatchObject({ isLive: true, pinned: false, who: "Adam" });
    expect(out.checkpoints[2]).toMatchObject({ name: "Spring", pinned: true });
  });
  it("keeps an old pinned checkpoint that fell outside the newest 20", async () => {
    const rows = Array.from({ length: 25 }, (_, i) =>
      published(i + 1, i === 0 ? { checkpoint_pinned: true } : {}),
    );
    const { client } = db(rows);
    const out = (await call(listCheckpoints, { organizationId: ORG }, client)) as {
      checkpoints: Row[];
    };
    const versions = out.checkpoints.map((c) => c["version"]);
    expect(versions).toHaveLength(21);
    expect(versions).toContain(1);
    expect(versions).not.toContain(5);
  });
});

describe("updateCheckpoint", () => {
  it("refuses non-owners on the server", async () => {
    mock.role = "manager";
    const { client, updates } = db([published(1)]);
    await expect(
      call(updateCheckpoint, { organizationId: ORG, versionId: vid(1), pinned: true }, client),
    ).rejects.toThrow(/permission/);
    expect(updates).toEqual([]);
  });
  it("names and pins inside the snapshot, keeping the rest of it", async () => {
    const rows = [published(1)];
    const { client } = db(rows);
    expect(
      await call(
        updateCheckpoint,
        { organizationId: ORG, versionId: vid(1), name: "  Before   prices ", pinned: true },
        client,
      ),
    ).toEqual({
      name: "Before prices",
      pinned: true,
    });
    expect(rows[0]!["pages"]).toMatchObject({
      live_format: 1,
      checkpoint_name: "Before prices",
      checkpoint_pinned: true,
    });
    await call(
      updateCheckpoint,
      { organizationId: ORG, versionId: vid(1), name: "", pinned: false },
      client,
    );
    expect(rows[0]!["pages"]).not.toHaveProperty("checkpoint_name");
    expect(rows[0]!["pages"]).not.toHaveProperty("checkpoint_pinned");
  });
  it("caps pins at 10", async () => {
    const rows = Array.from({ length: 11 }, (_, i) =>
      published(i + 1, i < 10 ? { checkpoint_pinned: true } : {}),
    );
    const { client } = db(rows);
    await expect(
      call(updateCheckpoint, { organizationId: ORG, versionId: vid(11), pinned: true }, client),
    ).rejects.toThrow(/up to 10/);
  });
  it("rejects drafts and other workspaces' versions", async () => {
    const draft = { ...published(1), published_at: null };
    const { client } = db([
      draft,
      { ...published(2), organization_id: "22222222-2222-4222-8222-222222222222" },
    ]);
    await expect(
      call(updateCheckpoint, { organizationId: ORG, versionId: vid(1), pinned: true }, client),
    ).rejects.toThrow(/saved copy/);
    await expect(
      call(updateCheckpoint, { organizationId: ORG, versionId: vid(2), pinned: true }, client),
    ).rejects.toThrow(/saved copy/);
  });
});

describe("restoreCheckpoint", () => {
  it("goes through publishSiteNow with the checkpoint id", async () => {
    mock.publish.mockResolvedValue({ activated: true, reason: null, version: 4 });
    const { client } = db([published(1)]);
    expect(
      await call(restoreCheckpoint, { organizationId: ORG, versionId: vid(1) }, client),
    ).toEqual({ activated: true, reason: null, version: 4 });
    expect(mock.publish).toHaveBeenCalledWith(client, USER, ORG, { restoreVersionId: vid(1) });
  });
  it("refuses non-owners before publishing", async () => {
    mock.role = "manager";
    const { client } = db([published(1)]);
    await expect(
      call(restoreCheckpoint, { organizationId: ORG, versionId: vid(1) }, client),
    ).rejects.toThrow(/permission/);
    expect(mock.publish).not.toHaveBeenCalled();
  });
});

describe("compareCheckpoint", () => {
  it("returns outlines of the checkpoint and the live site", async () => {
    const { client } = db([published(1), published(2)]);
    const out = (await call(
      compareCheckpoint,
      { organizationId: ORG, versionId: vid(1) },
      client,
    )) as Row;
    expect(out["liveVersion"]).toBe(2);
    expect(JSON.stringify(out["before"])).toContain("Heading 1");
    expect(JSON.stringify(out["after"])).toContain("Heading 2");
  });
  it("refuses non-owners", async () => {
    mock.role = "staff";
    const { client } = db([published(1)]);
    await expect(
      call(compareCheckpoint, { organizationId: ORG, versionId: vid(1) }, client),
    ).rejects.toThrow(/permission/);
  });
});
