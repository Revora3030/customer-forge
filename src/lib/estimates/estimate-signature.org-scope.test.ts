/**
 * saveEstimateSignature writes with the service role, so a browser-supplied
 * leadId must be checked against the caller's workspace first. These run the
 * REAL handler with a fake caller client (models RLS + filters) and a recording
 * fake service-role client, and show a lead from another workspace is refused
 * BEFORE anything is uploaded or inserted.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LEAD_A = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const LEAD_B = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1";
const STAFF_A = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  adminCalls: [] as string[],
  inserted: [] as Record<string, unknown>[],
  leads: [] as Record<string, unknown>[],
}));

/** Minimal PostgREST-like reader over a row list; filters are exact-match eq. */
function leadsTable(rows: Row[]) {
  const filters: Array<(r: Row) => boolean> = [];
  const b = {
    select: () => b,
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    maybeSingle: async () => ({ data: rows.find((r) => filters.every((f) => f(r))) ?? null, error: null }),
  };
  return b;
}

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
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ headers: new Headers({ "user-agent": "vitest" }) }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/org-authz.server", () => ({ requireOrgRole: async () => "staff" }));
vi.mock("./signature-salt.server", () => ({ estimateSignatureIpSalt: () => "" }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({
        upload: async (path: string) => (h.adminCalls.push(`upload:${path}`), { data: { path }, error: null }),
        remove: async () => (h.adminCalls.push("remove"), { data: null, error: null }),
      }),
    },
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        h.adminCalls.push(`insert:${table}`);
        h.inserted.push(row);
        return { select: () => ({ single: async () => ({ data: { id: "sig-1" }, error: null }) }) };
      },
    }),
  },
}));

// Smallest input that passes the PNG validator: the 8-byte PNG signature.
const PNG = `data:image/png;base64,${btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))}`;

const input = (leadId: string | null) => ({
  organizationId: ORG_A,
  leadId,
  documentNumber: "EST-1",
  documentJson: JSON.stringify({ kind: "estimate", totalCents: 12345 }),
  signerName: "Pat Customer",
  signaturePng: PNG,
});

const context = {
  supabase: { from: (name: string) => (name === "leads" ? leadsTable(h.leads) : leadsTable([])) },
  userId: STAFF_A,
};

type Save = (arg: { data: unknown; context: unknown }) => Promise<{ ok: boolean; id?: string }>;
const loadSave = async () =>
  (
    (await import(/* @vite-ignore */ "@/lib/estimates/estimate-signature.functions?server-fn-module-lookup")) as Record<string, unknown>
  ).saveEstimateSignature as unknown as Save;

beforeEach(() => {
  h.adminCalls.length = 0;
  h.inserted.length = 0;
  h.leads.length = 0;
  h.leads.push({ id: LEAD_A, organization_id: ORG_A }, { id: LEAD_B, organization_id: ORG_B });
});

describe("assertLeadInOrg", () => {
  it("accepts a lead in the caller's workspace and a missing leadId", async () => {
    const { assertLeadInOrg } = await import("./estimate-lead-scope.server");
    const db = context.supabase as never;
    await expect(assertLeadInOrg(db, ORG_A, LEAD_A)).resolves.toBeUndefined();
    await expect(assertLeadInOrg(db, ORG_A, null)).resolves.toBeUndefined();
  });

  it("rejects a lead that belongs to another workspace or does not exist", async () => {
    const { assertLeadInOrg, LEAD_NOT_IN_WORKSPACE } = await import("./estimate-lead-scope.server");
    const db = context.supabase as never;
    await expect(assertLeadInOrg(db, ORG_A, LEAD_B)).rejects.toThrow(LEAD_NOT_IN_WORKSPACE);
    await expect(assertLeadInOrg(db, ORG_A, "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1")).rejects.toThrow(
      LEAD_NOT_IN_WORKSPACE,
    );
  });

  it("fails closed when the lookup errors", async () => {
    const { assertLeadInOrg } = await import("./estimate-lead-scope.server");
    const failing = {
      from: () => {
        const b = { select: () => b, eq: () => b, maybeSingle: async () => ({ data: null, error: { message: "boom" } }) };
        return b;
      },
    };
    await expect(assertLeadInOrg(failing as never, ORG_A, LEAD_A)).rejects.toThrow(/Couldn't check that lead: boom/);
  });
});

describe("saveEstimateSignature lead scoping", () => {
  it("refuses another workspace's lead before touching the service role", async () => {
    const save = await loadSave();
    await expect(save({ data: input(LEAD_B), context })).rejects.toThrow("That lead wasn't found in this workspace.");
    expect(h.adminCalls).toEqual([]);
    expect(h.inserted).toEqual([]);
  });

  it("saves with a lead from the caller's own workspace", async () => {
    const save = await loadSave();
    const res = await save({ data: input(LEAD_A), context });
    expect(res).toMatchObject({ ok: true, id: "sig-1" });
    expect(h.adminCalls[0]).toMatch(new RegExp(`^upload:${ORG_A}/`));
    expect(h.adminCalls).toContain("insert:estimate_signatures");
    expect(h.inserted[0]).toMatchObject({ organization_id: ORG_A, lead_id: LEAD_A });
  });

  it("still saves without a lead", async () => {
    const save = await loadSave();
    const res = await save({ data: input(null), context });
    expect(res).toMatchObject({ ok: true });
    expect(h.inserted[0]).toMatchObject({ organization_id: ORG_A, lead_id: null });
  });
});
