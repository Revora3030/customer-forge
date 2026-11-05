import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmMemory, deleteMemory, editMemory, importWebsiteMemory, listMemory, memoryHistory, recallMemory, recordMemory,
  type MemoryContext,
} from "@/lib/business-memory.server";

type Row = { id?: unknown; organization_id?: unknown; status?: unknown; action?: unknown; deleted_at?: unknown; memory_id?: unknown; [column: string]: unknown };
type Tables = { business_memory: Row[]; business_memory_events: Row[]; business_memory_embeddings: Row[]; website_memory: Row[] } & Record<string, Row[]>;

/** Tiny in-memory stand-in for the Supabase query builder: insert, select, update, eq, is, in, order, limit. */
function fakeDb(seed: Record<string, Row[]> = {}, rpc?: (name: string, args: Record<string, unknown>) => { data: unknown; error: unknown }) {
  const tables: Tables = { business_memory: [], business_memory_events: [], business_memory_embeddings: [], website_memory: [], ...seed };
  let counter = 0;
  const builder = (name: string) => {
    const filters: ((row: Row) => boolean)[] = [];
    let mode: "select" | "insert" | "update" | "upsert" = "select";
    let payload: Row = {};
    let max = Infinity;
    const run = () => {
      const table = (tables[name] ??= []);
      if (mode === "insert") {
        const row: Row = { id: `id-${++counter}`, status: "proposed", deleted_at: null, superseded_by: null, confirmed_by: null, confirmed_at: null, created_at: new Date(1_000_000 + counter).toISOString(), updated_at: "now", source_quote: null, fetched_at: null, ...payload };
        table.push(row);
        return [row];
      }
      if (mode === "upsert") {
        const at = table.findIndex((row) => row.memory_id === payload.memory_id);
        if (at >= 0) table[at] = { ...table[at], ...payload };
        else table.push({ ...payload });
        return [payload];
      }
      const hits = table.filter((row) => filters.every((f) => f(row)));
      if (mode === "update") hits.forEach((row) => Object.assign(row, payload));
      return hits.slice(0, max).map((row) => ({ ...row }));
    };
    const api: Record<string, unknown> = {
      insert: (row: Row) => { mode = "insert"; payload = row; return api; },
      upsert: (row: Row) => { mode = "upsert"; payload = row; return api; },
      update: (row: Row) => { mode = "update"; payload = row; return api; },
      select: () => api,
      eq: (col: string, value: unknown) => { filters.push((row) => row[col] === value); return api; },
      is: (col: string, value: unknown) => { filters.push((row) => (row[col] ?? null) === value); return api; },
      in: (col: string, values: unknown[]) => { filters.push((row) => values.includes(row[col])); return api; },
      order: (col: string, opts?: { ascending?: boolean }) => {
        const prev = run;
        const sorted = () => {
          const out = prev();
          out.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (opts?.ascending === false ? -1 : 1));
          return out;
        };
        (api as { _run: () => Row[] })._run = sorted;
        return api;
      },
      limit: (n: number) => { max = n; return api; },
      single: () => { const out = ((api as { _run?: () => Row[] })._run ?? run)(); return Promise.resolve(out[0] ? { data: out[0], error: null } : { data: null, error: { message: "no rows" } }); },
      maybeSingle: () => { const out = ((api as { _run?: () => Row[] })._run ?? run)(); return Promise.resolve({ data: out[0] ?? null, error: null }); },
      then: (resolve: (value: unknown) => unknown) => resolve({ data: ((api as { _run?: () => Row[] })._run ?? run)(), error: null }),
    };
    return api;
  };
  const db = {
    from: (name: string) => builder(name),
    rpc: (name: string, args: Record<string, unknown>) => Promise.resolve(rpc ? rpc(name, args) : { data: [], error: null }),
  };
  return { db: db as never, tables };
}

const ORG_A = "org-a";
const ORG_B = "org-b";
const owner = (organizationId = ORG_A): MemoryContext => ({ organizationId, actor: { kind: "owner", userId: "user-1" } });
const agent = (organizationId = ORG_A): MemoryContext => ({ organizationId, actor: { kind: "agent", userId: "user-1" } });

const base = (over: Row = {}): Row => ({
  id: "m", organization_id: ORG_A, kind: "fact", key: "Phone", value: "555 0100", status: "confirmed", source_type: "owner_entered", source_id: null,
  deleted_at: null, superseded_by: null, created_at: "2026-11-05T00:00:00Z", ...over,
});

beforeEach(() => vi.restoreAllMocks());

describe("recordMemory", () => {
  it("rejects a fact with no source and saves nothing", async () => {
    const { db, tables } = fakeDb();
    const result = await recordMemory(db, agent(), { kind: "fact", key: "Hours", value: "9 to 5", sourceType: "agent_inference" });
    expect(result.ok).toBe(false);
    expect(tables.business_memory).toHaveLength(0);
  });

  it("saves an assistant's guess as proposed, never confirmed", async () => {
    const { db, tables } = fakeDb();
    const result = await recordMemory(db, agent(), { kind: "fact", key: "Hours", value: "9 to 5", sourceType: "agent_inference", sourceId: "run-1" });
    expect(result.ok && result.row.status).toBe("proposed");
    expect(tables.business_memory[0]).toMatchObject({ organization_id: ORG_A, status: "proposed", source_type: "agent_inference", source_id: "run-1" });
    expect(tables.business_memory[0]).toMatchObject({ confirmed_by: null, confirmed_at: null });
  });

  it("even an assistant claiming owner_message saves as proposed", async () => {
    const { db } = fakeDb();
    const result = await recordMemory(db, agent(), { kind: "fact", key: "Hours", value: "9 to 5", sourceType: "owner_message", sourceId: "msg-1" });
    expect(result.ok && result.row.status).toBe("proposed");
  });

  it("confirms the owner's own message with the message id", async () => {
    const { db, tables } = fakeDb();
    const result = await recordMemory(db, owner(), { kind: "fact", key: "Hours", value: "9 to 5", sourceType: "owner_message", sourceId: "msg-7" });
    expect(result.ok && result.row.status).toBe("confirmed");
    expect(tables.business_memory[0]).toMatchObject({ source_type: "owner_message", source_id: "msg-7", confirmed_by: "user-1", created_by: "user-1" });
    expect(tables.business_memory_events[0]).toMatchObject({ action: "confirmed", actor_kind: "owner", actor_id: "user-1", organization_id: ORG_A });
  });

  it("does not save the same note twice", async () => {
    const { db, tables } = fakeDb();
    await recordMemory(db, owner(), { kind: "fact", key: "Hours", value: "9 to 5", sourceType: "owner_entered" });
    const again = await recordMemory(db, owner(), { kind: "fact", key: " hours ", value: "9  to 5", sourceType: "owner_entered" });
    expect(again.ok && again.duplicate).toBe(true);
    expect(tables.business_memory).toHaveLength(1);
  });

  it("an assistant proposal never replaces or duplicates a confirmed note", async () => {
    const { db, tables } = fakeDb();
    await recordMemory(db, owner(), { kind: "fact", key: "Hours", value: "9 to 5", sourceType: "owner_entered" });
    const proposed = await recordMemory(db, agent(), { kind: "fact", key: "Hours", value: "9 to 5", sourceType: "agent_inference", sourceId: "run-2" });
    expect(proposed.ok && proposed.duplicate).toBe(true);
    expect(tables.business_memory).toHaveLength(1);
  });

  it("a newer owner answer supersedes the confirmed one with the same label", async () => {
    const { db, tables } = fakeDb();
    await recordMemory(db, owner(), { kind: "fact", key: "Hours", value: "9 to 5", sourceType: "owner_entered" });
    const next = await recordMemory(db, owner(), { kind: "fact", key: "Hours", value: "10 to 6", sourceType: "owner_entered" });
    expect(next.ok && next.row.value).toBe("10 to 6");
    const [first, second] = tables.business_memory;
    expect(first).toMatchObject({ status: "superseded", superseded_by: second!.id });
    expect(second).toMatchObject({ status: "confirmed" });
    expect(tables.business_memory_events.map((e) => e.action)).toContain("superseded");
  });

  it("the owner restating a proposed note confirms that note instead of adding another", async () => {
    const { db, tables } = fakeDb();
    await recordMemory(db, agent(), { kind: "fact", key: "Hours", value: "9 to 5", sourceType: "agent_inference", sourceId: "run-1" });
    const result = await recordMemory(db, owner(), { kind: "fact", key: "Hours", value: "9 to 5", sourceType: "owner_entered" });
    expect(result.ok && result.row.status).toBe("confirmed");
    expect(tables.business_memory).toHaveLength(1);
  });

  it("writes the workspace from the session, whatever the input says", async () => {
    const { db, tables } = fakeDb();
    await recordMemory(db, owner(ORG_B), { kind: "fact", key: "k", value: "v", sourceType: "owner_entered", organization_id: ORG_A } as never);
    expect(tables.business_memory[0]!.organization_id).toBe(ORG_B);
  });
});

describe("confirm, edit and delete", () => {
  it("only an owner can confirm; the assistant cannot", async () => {
    const { db, tables } = fakeDb({ business_memory: [base({ id: "p1", status: "proposed", source_type: "agent_inference", source_id: "run-1" })] });
    const denied = await confirmMemory(db, agent(), "p1");
    expect(denied.ok).toBe(false);
    expect(tables.business_memory[0]!.status).toBe("proposed");
    const ok = await confirmMemory(db, owner(), "p1");
    expect(ok.ok && ok.row.status).toBe("confirmed");
    expect(tables.business_memory[0]).toMatchObject({ confirmed_by: "user-1" });
  });

  it("confirming replaces the older confirmed note with the same label", async () => {
    const { db, tables } = fakeDb({
      business_memory: [base({ id: "old", value: "9 to 5", key: "Hours" }), base({ id: "new", key: "Hours", value: "10 to 6", status: "proposed", source_type: "agent_inference", source_id: "r" })],
    });
    await confirmMemory(db, owner(), "new");
    expect(tables.business_memory.find((r) => r.id === "old")).toMatchObject({ status: "superseded", superseded_by: "new" });
  });

  it("cannot confirm another workspace's note", async () => {
    const { db, tables } = fakeDb({ business_memory: [base({ id: "x", organization_id: ORG_B, status: "proposed", source_type: "agent_inference", source_id: "r" })] });
    const result = await confirmMemory(db, owner(ORG_A), "x");
    expect(result.ok).toBe(false);
    expect(tables.business_memory[0]!.status).toBe("proposed");
  });

  it("editing writes a history event with old value, new value and who", async () => {
    const { db, tables } = fakeDb({ business_memory: [base({ id: "m1", key: "Hours", value: "9 to 5" })] });
    const result = await editMemory(db, owner(), "m1", { value: "10 to 6" });
    expect(result.ok && result.row.value).toBe("10 to 6");
    expect(tables.business_memory_events).toHaveLength(1);
    expect(tables.business_memory_events[0]).toMatchObject({
      memory_id: "m1", organization_id: ORG_A, action: "edited", actor_kind: "owner", actor_id: "user-1",
      old_value: { key: "Hours", value: "9 to 5" }, new_value: { key: "Hours", value: "10 to 6" },
    });
    const history = await memoryHistory(db, owner(), "m1");
    expect(history).toHaveLength(1);
    expect(await memoryHistory(db, owner(ORG_B), "m1")).toEqual([]);
  });

  it("an edit that changes nothing writes no event, and the assistant cannot edit", async () => {
    const { db, tables } = fakeDb({ business_memory: [base({ id: "m1" })] });
    const same = await editMemory(db, owner(), "m1", { value: "555 0100" });
    expect(same.ok && same.duplicate).toBe(true);
    expect((await editMemory(db, agent(), "m1", { value: "other" })).ok).toBe(false);
    expect(tables.business_memory_events).toHaveLength(0);
  });

  it("an edit cannot strip the source rules (empty text is refused)", async () => {
    const { db } = fakeDb({ business_memory: [base({ id: "m1" })] });
    expect((await editMemory(db, owner(), "m1", { value: "  " })).ok).toBe(false);
  });

  it("delete is soft: the row and its history stay, but it is no longer listed or recalled", async () => {
    const { db, tables } = fakeDb({ business_memory: [base({ id: "m1", key: "Phone", value: "call 555 0100" })] });
    const result = await deleteMemory(db, owner(), "m1");
    expect(result.ok).toBe(true);
    expect(tables.business_memory).toHaveLength(1);
    expect(tables.business_memory[0]!.deleted_at).toBeTruthy();
    expect(tables.business_memory_events[0]).toMatchObject({ action: "deleted", old_value: { status: "confirmed", key: "Phone", value: "call 555 0100" } });
    expect(await listMemory(db, owner())).toEqual([]);
    expect(await recallMemory(db, owner(), "phone number")).toEqual([]);
    expect((await deleteMemory(db, owner(), "m1")).ok).toBe(false);
  });

  it("cannot delete or edit another workspace's note", async () => {
    const { db, tables } = fakeDb({ business_memory: [base({ id: "x", organization_id: ORG_B })] });
    expect((await deleteMemory(db, owner(ORG_A), "x")).ok).toBe(false);
    expect((await editMemory(db, owner(ORG_A), "x", { value: "hacked" })).ok).toBe(false);
    expect(tables.business_memory[0]).toMatchObject({ value: "555 0100", deleted_at: null });
  });
});

describe("listMemory and recallMemory isolation", () => {
  const seed = () => ({
    business_memory: [
      base({ id: "a1", key: "Delivery area", value: "We deliver within Boston", source_type: "owner_entered" }),
      base({ id: "a2", key: "Parking", value: "Free parking behind the shop", status: "proposed", source_type: "agent_inference", source_id: "run-1" }),
      base({ id: "b1", organization_id: ORG_B, key: "Delivery area", value: "We deliver within Denver" }),
    ],
  });

  it("lists only this workspace's notes", async () => {
    const { db } = fakeDb(seed());
    expect((await listMemory(db, owner(ORG_A))).map((r) => r.id).sort()).toEqual(["a1", "a2"]);
    expect((await listMemory(db, owner(ORG_B))).map((r) => r.id)).toEqual(["b1"]);
  });

  it("falls back to word overlap and shows each note's source", async () => {
    const { db } = fakeDb(seed());
    const hits = await recallMemory(db, owner(), "where is parking and delivery?");
    expect(hits.map((h) => h.id).sort()).toEqual(["a1", "a2"]);
    expect(hits.find((h) => h.id === "a1")!.source).toBe("You told us this");
    expect(hits.find((h) => h.id === "a2")).toMatchObject({ status: "proposed", source: "Worked out by the assistant (not confirmed yet)" });
    expect(hits.every((h) => !h.value.includes("Denver"))).toBe(true);
  });

  it("never returns another workspace's note, even if the vector search hands it back", async () => {
    const calls: Record<string, unknown>[] = [];
    const admin = fakeDb({}, (_name, args) => {
      calls.push(args);
      return { data: [{ memory_id: "b1", similarity: 0.99 }, { memory_id: "a1", similarity: 0.5 }], error: null };
    }).db;
    const { db } = fakeDb(seed());
    vi.doMock("@/lib/jarvis-memory-vectors.server", () => ({
      embedTexts: async () => [[0.1, 0.2]], toVectorLiteral: () => "[0.1,0.2]", contentHash: async () => "h", MEMORY_EMBEDDING_MODEL: "test",
    }));
    const hits = await recallMemory(db, owner(ORG_A), "delivery", {}, { admin });
    vi.doUnmock("@/lib/jarvis-memory-vectors.server");
    expect(hits.map((h) => h.id)).toEqual(["a1"]);
    expect(calls[0]).toMatchObject({ p_org_id: ORG_A });
    expect(hits[0]!.similarity).toBe(0.5);
  });

  it("falls back to word overlap when the vector search fails", async () => {
    const admin = fakeDb({}, () => ({ data: null, error: { message: "boom" } })).db;
    const { db } = fakeDb(seed());
    vi.doMock("@/lib/jarvis-memory-vectors.server", () => ({
      embedTexts: async () => [[0.1]], toVectorLiteral: () => "[0.1]", contentHash: async () => "h", MEMORY_EMBEDDING_MODEL: "test",
    }));
    const hits = await recallMemory(db, owner(), "parking", {}, { admin });
    vi.doUnmock("@/lib/jarvis-memory-vectors.server");
    expect(hits.map((h) => h.id)).toEqual(["a2"]);
  });

  it("returns nothing for an empty question and respects the limit", async () => {
    const { db } = fakeDb(seed());
    expect(await recallMemory(db, owner(), "   ")).toEqual([]);
    expect(await recallMemory(db, owner(), "delivery parking", { limit: 1 })).toHaveLength(1);
  });
});

describe("importWebsiteMemory", () => {
  it("imports website notes as proposed facts that name their source, once", async () => {
    const { db, tables } = fakeDb({
      website_memory: [
        { id: "w1", organization_id: ORG_A, kind: "rule", text: "Always show prices in USD", created_at: "2026-11-01" },
        { id: "w2", organization_id: ORG_B, kind: "rule", text: "Other workspace", created_at: "2026-11-01" },
      ],
    });
    expect(await importWebsiteMemory(db, owner())).toEqual({ imported: 1, skipped: 0 });
    expect(tables.business_memory).toHaveLength(1);
    expect(tables.business_memory[0]).toMatchObject({ organization_id: ORG_A, status: "proposed", source_type: "website_memory", source_id: "w1" });
    expect(await importWebsiteMemory(db, owner())).toEqual({ imported: 0, skipped: 1 });
    expect(tables.business_memory).toHaveLength(1);
  });
});
