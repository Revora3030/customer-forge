/**
 * PAI-5 tool isolation. Scope: the AI tool registry (`ai/tools.server.ts`) and
 * the loop's tool door only. Table RLS and edge functions are covered by the
 * cross-tenant suite, not here.
 *
 * Every registered tool is run as workspace A with arguments that point at
 * workspace B. Nothing of B may be read, returned, changed, audited or passed
 * to a side effect. A tool without an isolation fixture FAILS the suite, so a
 * newly registered tool cannot ship without an org-scope check being declared
 * and exercised here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext, ToolResult } from "./tools.server";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_A = "a0000000-0000-4000-8000-00000000000a";
const SECRET_B = "ORG-B-SECRET-DO-NOT-LEAK";
const SECRET_A = "ORG-A-OWN-DATA";

/* ------------------------------- fake backends ------------------------------ */

type Row = Record<string, unknown> & { organization_id: string };
type QueryLog = { table: string; column: string; value: unknown };

/**
 * Two-tenant fake database. With `rls` on it behaves like the caller's RLS
 * client (only workspace A rows are ever visible); with it off it returns every
 * row that matches the filter, which is how an unscoped tool would leak.
 */
function fakeTenantDb(rls: boolean) {
  const tables: Record<string, Row[]> = {
    website_pages: [
      { organization_id: ORG_A, id: "page-a", title: SECRET_A },
      { organization_id: ORG_B, id: "page-b", title: SECRET_B },
    ],
    website_sections: [
      { organization_id: ORG_A, id: "sec-a", heading: SECRET_A },
      { organization_id: ORG_B, id: "sec-b", heading: SECRET_B },
    ],
  };
  const queries: QueryLog[] = [];
  const client = {
    from: (table: string) => ({
      select: (_columns: string) => ({
        eq: async (column: string, value: unknown) => {
          queries.push({ table, column, value });
          const rows = (tables[table] ?? []).filter((r) => r[column] === value && (!rls || r.organization_id === ORG_A));
          return { data: rows, error: null };
        },
      }),
    }),
  };
  return { client: client as unknown as ToolContext["supabase"], queries };
}

const adminInserts: { table: string; row: Record<string, unknown> }[] = [];
const sideEffects: { name: string; organizationId: unknown }[] = [];

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        adminInserts.push({ table, row });
        return { error: null };
      },
    }),
  },
}));
vi.mock("@/lib/agent/verify.server", () => ({
  verifyWorkspaceSite: async (_client: unknown, organizationId: string) => {
    sideEffects.push({ name: "verify_live_pages", organizationId });
    return { checked: 0, organizationId };
  },
}));
vi.mock("@/lib/ai/router.server", () => ({
  generateImage: async (scope: { organizationId: string }) => {
    sideEffects.push({ name: "generate_image", organizationId: scope.organizationId });
    return { mimeType: "image/png", base64: "AAAA" };
  },
}));

beforeEach(() => {
  adminInserts.length = 0;
  sideEffects.length = 0;
});

/* ---------------------------------- harness --------------------------------- */

type Exec = (context: ToolContext, call: { name: string; arguments: unknown; requestId: string }) => Promise<ToolResult>;

/** What it takes to attack one tool: arguments that point at workspace B. */
type Fixture = { attack: (orgB: string) => unknown; legit?: (orgA: string) => unknown };

/**
 * Every registered tool needs an entry. Add the new tool's name here with an
 * `attack` that tries to reach workspace B; the suite then proves it cannot.
 */
const FIXTURES: Record<string, Fixture> = {
  inspect_website: {
    attack: (b) => ({ organizationId: b }),
    legit: (a) => ({ organizationId: a }),
  },
  verify_live_pages: {
    attack: (b) => ({ organizationId: b }),
    legit: (a) => ({ organizationId: a }),
  },
  // No workspace id in the input: scope comes only from the signed-in context,
  // so even extra org fields smuggled in by the model must change nothing.
  generate_image: {
    attack: (b) => ({ prompt: "a logo", organizationId: b, organization_id: b }),
  },
  // Undo steps are functions recorded in-process; JSON from a model cannot
  // carry one, so a hostile list is inert.
  rollback_changes: {
    attack: (b) => ({ steps: [{ label: `undo ${b}`, organizationId: b, sql: `delete from website_pages where organization_id='${b}'` }] }),
  },
};

/** Names of tools that have no isolation fixture (must be empty). */
function toolsMissingFixtures(names: string[], fixtures: Record<string, Fixture> = FIXTURES) {
  return names.filter((name) => !(name in fixtures));
}

function contextFor(rls: boolean) {
  const db = fakeTenantDb(rls);
  const context: ToolContext = { supabase: db.client, userId: USER_A, organizationId: ORG_A, isSuperAdmin: true };
  return { db, context };
}

/**
 * Runs one attack as workspace A and returns every way workspace B was
 * touched. An empty list means the tool is isolated.
 */
async function probe(name: string, fixture: Fixture, exec: Exec, rls = true): Promise<string[]> {
  const { db, context } = contextFor(rls);
  const violations: string[] = [];
  const result = await exec(context, { name, arguments: fixture.attack(ORG_B), requestId: `iso-${name}` });

  const returned = JSON.stringify(result);
  if (returned.includes(SECRET_B)) violations.push("returned workspace B data");
  if (returned.includes("page-b") || returned.includes("sec-b")) violations.push("returned workspace B rows");
  for (const q of db.queries) if (q.value === ORG_B) violations.push(`queried ${q.table} for workspace B`);
  for (const e of sideEffects) if (e.organizationId === ORG_B) violations.push(`side effect ${e.name} ran for workspace B`);
  for (const a of adminInserts) {
    if (a.row["organization_id"] === ORG_B) violations.push(`${a.table} row written for workspace B`);
  }
  return violations;
}

/* ----------------------------------- tests ---------------------------------- */

describe("AI tool isolation: every registered tool, as workspace A against workspace B", () => {
  it("has an isolation fixture for every registered tool", async () => {
    const { listTools } = await import("./tools.server");
    const registered = listTools({ isSuperAdmin: true }).map((t) => t.name);
    expect(registered.length).toBeGreaterThan(0);
    expect(toolsMissingFixtures(registered)).toEqual([]);
  });

  it("has no stale fixtures for tools that no longer exist", async () => {
    const { listTools } = await import("./tools.server");
    const registered = new Set(listTools({ isSuperAdmin: true }).map((t) => t.name));
    expect(Object.keys(FIXTURES).filter((name) => !registered.has(name))).toEqual([]);
  });

  it("returns nothing and changes nothing of workspace B, for every tool", async () => {
    const { listTools, runTool } = await import("./tools.server");
    for (const { name } of listTools({ isSuperAdmin: true })) {
      const fixture = FIXTURES[name];
      expect(fixture, `no isolation fixture for tool "${name}"`).toBeDefined();
      if (!fixture) continue;
      expect(await probe(name, fixture, runTool), `tool "${name}" reached workspace B`).toEqual([]);
    }
  });

  it("refuses an id for another workspace with tenant_mismatch and audits it under workspace A", async () => {
    const { runTool } = await import("./tools.server");
    const { context } = contextFor(true);
    for (const name of ["inspect_website", "verify_live_pages"]) {
      const result = await runTool(context, { name, arguments: { organizationId: ORG_B }, requestId: `tm-${name}` });
      expect(result).toMatchObject({ ok: false, reason: "tenant_mismatch" });
    }
    expect(sideEffects).toEqual([]);
    expect(adminInserts.length).toBe(2);
    for (const a of adminInserts) {
      expect(a.table).toBe("ai_tool_audit");
      expect(a.row).toMatchObject({ organization_id: ORG_A, ok: false, reason: "tenant_mismatch" });
    }
  });

  it("scopes tools without an org field to the signed-in workspace only", async () => {
    const { runTool } = await import("./tools.server");
    const { context } = contextFor(true);
    const result = await runTool(context, { name: "generate_image", arguments: FIXTURES["generate_image"]!.attack(ORG_B), requestId: "img" });
    expect(result.ok).toBe(true);
    expect(sideEffects).toEqual([{ name: "generate_image", organizationId: ORG_A }]);
  });

  it("control: a legitimate call for workspace A does see workspace A's data (the harness can see data)", async () => {
    const { runTool } = await import("./tools.server");
    const { context, db } = contextFor(true);
    const result = await runTool(context, { name: "inspect_website", arguments: FIXTURES["inspect_website"]!.legit!(ORG_A), requestId: "ok" });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).toContain(SECRET_A);
    expect(JSON.stringify(result)).not.toContain(SECRET_B);
    expect(db.queries.every((q) => q.value === ORG_A)).toBe(true);
  });

  it("a platform_admin-only or unknown tool name is refused, never run", async () => {
    const { runTool } = await import("./tools.server");
    const { context } = contextFor(true);
    const result = await runTool(context, { name: "read_every_workspace", arguments: { organizationId: ORG_B }, requestId: "x" });
    expect(result).toMatchObject({ ok: false, reason: "forbidden" });
  });
});

describe("the isolation harness catches an unscoped tool (self-test)", () => {
  /** A new tool written without an org-scope check: it trusts the id the model sent. */
  const unscopedStub = async (input: { organizationId: string }, context: ToolContext) => {
    const query = context.supabase.from("website_pages").select("id, title").eq("organization_id", input.organizationId);
    return (await (query as unknown as Promise<{ data: unknown }>)).data;
  };
  /** Same tool, but compared with the signed-in workspace first (what runTool does). */
  const scopedStub = async (input: { organizationId: string }, context: ToolContext) => {
    if (input.organizationId !== context.organizationId) throw new Error("wrong workspace");
    return unscopedStub(input, context);
  };
  const execStub =
    (run: typeof unscopedStub): Exec =>
    async (context, call) => {
      const started = Date.now();
      try {
        const data = await run(call.arguments as { organizationId: string }, context);
        return { ok: true, tool: call.name, data, durationMs: Date.now() - started };
      } catch (error) {
        return { ok: false, tool: call.name, error: (error as Error).message, reason: "failed", durationMs: 0 };
      }
    };
  const stubFixture: Fixture = { attack: (b) => ({ organizationId: b }) };

  it("FAILS an unscoped stub tool, even when the database itself would filter (it queried workspace B)", async () => {
    const violations = await probe("unscoped_stub", stubFixture, execStub(unscopedStub), true);
    expect(violations).toContain("queried website_pages for workspace B");
  });

  it("FAILS an unscoped stub tool that leaks data when nothing filters for it", async () => {
    const violations = await probe("unscoped_stub", stubFixture, execStub(unscopedStub), false);
    expect(violations).toEqual(expect.arrayContaining(["returned workspace B data", "returned workspace B rows"]));
  });

  it("passes a stub that checks the signed-in workspace first", async () => {
    expect(await probe("scoped_stub", stubFixture, execStub(scopedStub))).toEqual([]);
  });

  it("FAILS a newly registered tool that has no isolation fixture", () => {
    expect(toolsMissingFixtures(["inspect_website", "brand_new_tool"])).toEqual(["brand_new_tool"]);
  });
});
