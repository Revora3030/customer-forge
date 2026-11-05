/**
 * #802 / LPL-8: opening the in-app bell must persist is_read=true for unread rows.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  db: {} as Record<string, Array<Record<string, unknown>>>,
  writes: [] as Array<{ table: string; op: string; values: unknown; filters: Array<[string, unknown]> }>,
}));

function table(name: string) {
  const filters: Array<(r: Row) => boolean> = [];
  const filterPairs: Array<[string, unknown]> = [];
  let op: { kind: string; values: unknown } | null = null;
  const rows = () => (h.db[name] ?? []).filter((r) => filters.every((f) => f(r)));
  const applyUpdate = () => {
    if (!op || op.kind !== "update") return rows();
    const values = op.values as Record<string, unknown>;
    const matched = rows();
    for (const row of matched) Object.assign(row, values);
    return matched;
  };
  const b: Record<string, unknown> = {
    select: () => b,
    order: () => b,
    eq: (c: string, v: unknown) => {
      filterPairs.push([c, v]);
      filters.push((r) => r[c] === v);
      return b;
    },
    update: (values: unknown) => {
      op = { kind: "update", values };
      return b;
    },
    then: (res: (v: unknown) => unknown) => {
      const matched = applyUpdate();
      if (op) h.writes.push({ table: name, op: op.kind, values: op.values, filters: [...filterPairs] });
      return Promise.resolve({ data: matched.map((r) => ({ id: r.id })), error: null }).then(res);
    },
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

const FNS_PATH = "@/lib/notifications.functions?server-fn-module-lookup";
const fns = async () =>
  (await import(/* @vite-ignore */ FNS_PATH)) as typeof import("./notifications.functions");

type Fn = (arg: { data: unknown; context: unknown }) => Promise<Record<string, unknown>>;
const ctx = () => ({
  supabase: { from: (n: string) => table(n) },
  userId: "11111111-1111-4111-8111-111111111111",
});
const call = (fn: unknown, data: unknown, context: unknown) => (fn as Fn)({ data, context });

beforeEach(() => {
  h.writes.length = 0;
  h.db["notifications"] = [
    {
      id: "n1",
      organization_id: ORG,
      title: "New lead",
      body: "Ada",
      kind: "lead",
      is_read: false,
    },
    {
      id: "n2",
      organization_id: ORG,
      title: "Already seen",
      body: null,
      kind: "info",
      is_read: true,
    },
    {
      id: "n3",
      organization_id: OTHER,
      title: "Other org",
      body: null,
      kind: "lead",
      is_read: false,
    },
  ];
});

describe("shouldMarkNotificationsReadOnOpen", () => {
  it("only fires when the panel is opening with unread items", async () => {
    const { shouldMarkNotificationsReadOnOpen } = await fns();
    expect(shouldMarkNotificationsReadOnOpen(2, true)).toBe(true);
    expect(shouldMarkNotificationsReadOnOpen(0, true)).toBe(false);
    expect(shouldMarkNotificationsReadOnOpen(3, false)).toBe(false);
  });
});

describe("markNotificationsRead", () => {
  it("sets is_read true for unread rows in the caller's organization only", async () => {
    const { markNotificationsRead } = await fns();
    const result = await call(markNotificationsRead, { organizationId: ORG }, ctx());
    expect(result).toEqual({ ok: true, marked: 1 });
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0]).toMatchObject({
      table: "notifications",
      op: "update",
      values: { is_read: true },
    });
    expect(h.writes[0].filters).toEqual(
      expect.arrayContaining([
        ["organization_id", ORG],
        ["is_read", false],
      ]),
    );
    const orgRows = h.db["notifications"].filter((r) => r.organization_id === ORG);
    expect(orgRows.find((r) => r.id === "n1")?.is_read).toBe(true);
    expect(orgRows.find((r) => r.id === "n2")?.is_read).toBe(true);
    expect(h.db["notifications"].find((r) => r.id === "n3")?.is_read).toBe(false);
  });

  it("rejects a missing organization id", async () => {
    const { markNotificationsRead } = await fns();
    await expect(call(markNotificationsRead, { organizationId: "  " }, ctx())).rejects.toThrow(
      /Missing workspace/,
    );
    expect(h.writes).toHaveLength(0);
  });

  it("is a no-op write when nothing is unread", async () => {
    h.db["notifications"] = [
      { id: "n1", organization_id: ORG, title: "Seen", kind: "info", is_read: true },
    ];
    const { markNotificationsRead } = await fns();
    const result = await call(markNotificationsRead, { organizationId: ORG }, ctx());
    expect(result).toEqual({ ok: true, marked: 0 });
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0].values).toEqual({ is_read: true });
  });
});
