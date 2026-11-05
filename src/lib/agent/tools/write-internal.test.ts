import { describe, expect, it } from "vitest";
import { createToolRegistryV2, type ToolContextV2, type ToolInverse } from "@/lib/ai/tool-registry-v2.server";
import { writeInternalTools, writeInternalUndoHelpers, writeInternalAllTools } from "./write-internal";
import { undoRunWrites } from "./undo-run";
import { runAllowsWriteInternalTools, writeInternalToolNames } from "./write-policy";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const LEAD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const APPT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AUTO = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CUST = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

type Row = Record<string, unknown>;

/** Mutable fake client that applies insert/update/delete to in-memory tables. */
function fakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([k, v]) => [k, v.map((row) => ({ ...row }))]),
  );
  const client = {
    from(table: string) {
      const filters: Array<[string, string, unknown]> = [];
      let pendingInsert: Row[] | null = null;
      let pendingUpdate: Row | null = null;
      let pendingDelete = false;
      let wantSingle = false;
      let selectCols: string | null = null;

      const applyFilters = (rows: Row[]) =>
        rows.filter((row) =>
          filters.every(([op, col, val]) => {
            if (op === "eq") return row[col] === val;
            return true;
          }),
        );

      const run = () => {
        if (pendingInsert) {
          const inserted = pendingInsert.map((row) => {
            const withId = { id: row["id"] ?? crypto.randomUUID(), ...row };
            tables[table] = [...(tables[table] ?? []), withId];
            return withId;
          });
          return { data: inserted, error: null };
        }
        const matched = applyFilters(tables[table] ?? []);
        if (pendingUpdate) {
          for (const row of matched) Object.assign(row, pendingUpdate);
          return { data: matched.map((r) => ({ ...r })), error: null };
        }
        if (pendingDelete) {
          const ids = new Set(matched.map((r) => r["id"]));
          tables[table] = (tables[table] ?? []).filter((r) => !ids.has(r["id"]));
          return { data: matched.map((r) => ({ ...r })), error: null };
        }
        const rows = matched;
        // Return copies so callers can't observe later Object.assign mutations
        // (matches Supabase, which returns plain deserialized rows).
        if (wantSingle) {
          const row = rows[0];
          return { data: row ? { ...row } : null, error: null };
        }
        if (selectCols) {
          const cols = selectCols.split(",").map((c) => c.trim());
          return {
            data: rows.map((row) => Object.fromEntries(cols.map((c) => [c, row[c]]))),
            error: null,
          };
        }
        return { data: rows.map((r) => ({ ...r })), error: null };
      };

      const chain: Record<string, unknown> = {};
      chain["select"] = (cols?: string) => {
        selectCols = cols ?? null;
        return chain;
      };
      chain["eq"] = (col: string, val: unknown) => {
        filters.push(["eq", col, val]);
        return chain;
      };
      chain["maybeSingle"] = () => {
        wantSingle = true;
        return chain;
      };
      chain["insert"] = (rows: Row | Row[]) => {
        pendingInsert = Array.isArray(rows) ? rows : [rows];
        return chain;
      };
      chain["update"] = (patch: Row) => {
        pendingUpdate = patch;
        return chain;
      };
      chain["delete"] = () => {
        pendingDelete = true;
        return chain;
      };
      chain["then"] = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject);
      return chain;
    },
  };
  return { client, tables };
}

function ctx(client: unknown): ToolContextV2 {
  return {
    supabase: client,
    userId: "u1",
    organizationId: ORG,
    isSuperAdmin: false,
  } as unknown as ToolContextV2;
}

function registry(client: unknown) {
  // Public writes only — mirrors agentTools. undoRunWrites brings its own helpers.
  return createToolRegistryV2(writeInternalTools(), {
    audit: async () => {},
    // Skip PAI-5 limits in unit tests (tools are not wrapped here).
  });
}

const baseTables = () => ({
  leads: [
    {
      id: LEAD,
      organization_id: ORG,
      status: "new",
      notes: "Hello",
      customer_id: null as string | null,
      name: "Pat",
    },
    {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      organization_id: OTHER,
      status: "new",
      notes: null,
      customer_id: null as string | null,
      name: "Other",
    },
  ],
  customers: [
    {
      id: CUST,
      organization_id: ORG,
      name: "Pat Customer",
      tags: ["vip"],
    },
  ],
  lead_tasks: [] as Row[],
  quotes: [] as Row[],
  quote_line_items: [] as Row[],
  appointments: [
    {
      id: APPT,
      organization_id: ORG,
      notes: "Arrive via alley",
      name: "Pat",
    },
  ],
  automations: [
    {
      id: AUTO,
      organization_id: ORG,
      is_active: true,
      name: "Review ask",
    },
  ],
});

describe("PAI-11 write_internal tools", () => {
  it("declares write_internal + inverse for every public write tool", () => {
    const names = writeInternalTools().map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "leads.update_status",
        "leads.add_note",
        "leads.add_tag",
        "leads.create_task",
        "quotes.draft",
        "bookings.add_note",
        "automations.toggle",
      ]),
    );
    for (const tool of writeInternalTools()) {
      expect(tool.risk).toBe("write_internal");
      expect(tool.scope).toBe("owner");
      expect(typeof tool.inverse).toBe("function");
    }
  });

  it("keeps undo-only helpers out of the model-callable writeInternalTools list", () => {
    const publicNames = writeInternalTools().map((t) => t.name);
    const helperNames = writeInternalUndoHelpers().map((t) => t.name);
    expect(helperNames).toEqual(
      expect.arrayContaining([
        "leads.restore_notes",
        "leads.restore_customer_tags",
        "leads.delete_task",
        "quotes.delete_draft",
        "bookings.restore_notes",
      ]),
    );
    for (const name of helperNames) {
      expect(publicNames).not.toContain(name);
    }
    expect(writeInternalAllTools().map((t) => t.name)).toEqual(
      expect.arrayContaining([...publicNames, ...helperNames]),
    );
    expect(writeInternalToolNames()).toEqual(new Set(publicNames));
  });

  it("blocks PAI-11 writes on routine-source and no_external_actions runs", () => {
    expect(runAllowsWriteInternalTools({ source: "owner", checkpoint: {} })).toBe(true);
    expect(runAllowsWriteInternalTools({ source: "routine", checkpoint: {} })).toBe(false);
    expect(
      runAllowsWriteInternalTools({
        source: "owner",
        checkpoint: { routine: { send_policy: "no_external_actions" } },
      }),
    ).toBe(false);
    expect(
      runAllowsWriteInternalTools({
        source: "owner",
        checkpoint: { routine: { send_policy: "approval_required" } },
      }),
    ).toBe(true);
  });

  it("updates lead status and undoes to the prior status", async () => {
    const { client, tables } = fakeDb(baseTables());
    const r = registry(client);
    const context = ctx(client);
    const res = await r.run(context, {
      name: "leads.update_status",
      arguments: { leadId: LEAD, status: "contacted" },
      requestId: "1",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(tables["leads"]![0]!["status"]).toBe("contacted");
    expect(res.inverse).toEqual({
      tool: "leads.update_status",
      arguments: { leadId: LEAD, status: "new" },
    });
    const undo = await undoRunWrites(r, context, [res.inverse!]);
    expect(undo.ok).toBe(true);
    expect(tables["leads"]![0]!["status"]).toBe("new");
  });

  it("refuses to touch another workspace's lead", async () => {
    const { client } = fakeDb(baseTables());
    const res = await registry(client).run(ctx(client), {
      name: "leads.update_status",
      arguments: { leadId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", status: "lost" },
      requestId: "x",
    });
    expect(res.ok).toBe(false);
  });

  it("appends a note and restores prior notes on undo", async () => {
    const { client, tables } = fakeDb(baseTables());
    const r = registry(client);
    const context = ctx(client);
    const res = await r.run(context, {
      name: "leads.add_note",
      arguments: { leadId: LEAD, note: "Called Monday" },
      requestId: "2",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(tables["leads"]![0]!["notes"]).toBe("Hello\nCalled Monday");
    await undoRunWrites(r, context, [res.inverse!]);
    expect(tables["leads"]![0]!["notes"]).toBe("Hello");
  });

  it("stores a reversible tag marker on notes when the lead has no customer", async () => {
    const { client, tables } = fakeDb(baseTables());
    const r = registry(client);
    const context = ctx(client);
    const res = await r.run(context, {
      name: "leads.add_tag",
      arguments: { leadId: LEAD, tag: "hot" },
      requestId: "3",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(String(tables["leads"]![0]!["notes"])).toContain("⟦tags:hot⟧");
    await undoRunWrites(r, context, [res.inverse!]);
    expect(tables["leads"]![0]!["notes"]).toBe("Hello");
  });

  it("adds a customer tag when the lead is linked, and undoes it", async () => {
    const seed = baseTables();
    seed.leads[0]!.customer_id = CUST;
    const { client, tables } = fakeDb(seed);
    const r = registry(client);
    const context = ctx(client);
    const res = await r.run(context, {
      name: "leads.add_tag",
      arguments: { leadId: LEAD, tag: "referral" },
      requestId: "4",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(tables["customers"]![0]!["tags"]).toEqual(["vip", "referral"]);
    await undoRunWrites(r, context, [res.inverse!]);
    expect(tables["customers"]![0]!["tags"]).toEqual(["vip"]);
  });

  it("creates a task whose inverse deletes only that task — never a lead", async () => {
    const { client, tables } = fakeDb(baseTables());
    const r = registry(client);
    const context = ctx(client);
    const res = await r.run(context, {
      name: "leads.create_task",
      arguments: { leadId: LEAD, title: "Call back", dueAt: null },
      requestId: "5",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(tables["lead_tasks"]).toHaveLength(1);
    expect(res.inverse?.tool).toBe("leads.delete_task");
    await undoRunWrites(r, context, [res.inverse!]);
    expect(tables["lead_tasks"]).toHaveLength(0);
    expect(tables["leads"]).toHaveLength(2);
  });

  it("drafts a quote and undoes by deleting only the draft", async () => {
    const { client, tables } = fakeDb(baseTables());
    const r = registry(client);
    const context = ctx(client);
    const res = await r.run(context, {
      name: "quotes.draft",
      arguments: {
        customerName: "Pat",
        leadId: LEAD,
        lines: [{ name: "Detail", unitPrice: 150, quantity: 1 }],
      },
      requestId: "6",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(tables["quotes"]).toHaveLength(1);
    expect(tables["quote_line_items"]).toHaveLength(1);
    expect(res.inverse?.tool).toBe("quotes.delete_draft");
    await undoRunWrites(r, context, [res.inverse!]);
    expect(tables["quotes"]).toHaveLength(0);
  });

  it("toggles an automation and restores the prior on/off state", async () => {
    const { client, tables } = fakeDb(baseTables());
    const r = registry(client);
    const context = ctx(client);
    const res = await r.run(context, {
      name: "automations.toggle",
      arguments: { automationId: AUTO, isActive: false },
      requestId: "7",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(tables["automations"]![0]!["is_active"]).toBe(false);
    await undoRunWrites(r, context, [res.inverse!]);
    expect(tables["automations"]![0]!["is_active"]).toBe(true);
  });

  it("appends a booking note and restores prior notes", async () => {
    const { client, tables } = fakeDb(baseTables());
    const r = registry(client);
    const context = ctx(client);
    const res = await r.run(context, {
      name: "bookings.add_note",
      arguments: { appointmentId: APPT, note: "Bring towels" },
      requestId: "8",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(tables["appointments"]![0]!["notes"]).toBe("Arrive via alley\nBring towels");
    await undoRunWrites(r, context, [res.inverse!]);
    expect(tables["appointments"]![0]!["notes"]).toBe("Arrive via alley");
  });

  it("run-level undo replays multiple inverses newest-first", async () => {
    const { client, tables } = fakeDb(baseTables());
    const r = registry(client);
    const context = ctx(client);
    const inverses: ToolInverse[] = [];
    for (const call of [
      { name: "leads.update_status", arguments: { leadId: LEAD, status: "qualified" } },
      { name: "leads.add_note", arguments: { leadId: LEAD, note: "Qualified today" } },
      { name: "automations.toggle", arguments: { automationId: AUTO, isActive: false } },
    ]) {
      const res = await r.run(context, { ...call, requestId: call.name });
      expect(res.ok).toBe(true);
      if (res.ok && res.inverse) inverses.push(res.inverse);
    }
    expect(tables["leads"]![0]!["status"]).toBe("qualified");
    expect(tables["automations"]![0]!["is_active"]).toBe(false);
    const undo = await undoRunWrites(r, context, inverses);
    expect(undo.ok).toBe(true);
    expect(undo.restored).toBe(3);
    expect(tables["leads"]![0]!["status"]).toBe("new");
    expect(tables["leads"]![0]!["notes"]).toBe("Hello");
    expect(tables["automations"]![0]!["is_active"]).toBe(true);
  });

  it("exposes no lead-delete tool", () => {
    expect(writeInternalTools().some((t) => /delete.*lead|leads\.delete$/i.test(t.name))).toBe(false);
  });
});
