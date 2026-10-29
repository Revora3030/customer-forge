import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appendReplyMeta } from "@/lib/jarvis-actions";
import {
  APPROVAL_TTL_MS,
  STALE_CLAIM_MS,
  claimApproval,
  finishApproval,
  listApprovals,
  proposalHash,
  recordProposals,
  rejectApproval,
  stableJson,
  tableMissing,
} from "@/lib/jarvis-approvals.server";

type Row = Record<string, unknown> & { user_id?: unknown; approval_key?: unknown; status?: unknown; summary?: unknown };

/** A tiny in-memory PostgREST stand-in: each statement runs atomically, like one SQL UPDATE. */
function fakeDb(tables: Record<string, Row[]> = {}, options: { missing?: boolean } = {}) {
  const data: { jarvis_approvals: Row[]; jarvis_messages: Row[] } & Record<string, Row[]> = { jarvis_approvals: [], jarvis_messages: [], ...tables };
  function query(table: string) {
    const filters: ((row: Row) => boolean)[] = [];
    let op: "select" | "update" | "insert" | "upsert" = "select";
    let patch: Row = {};
    let rows: Row[] = [];
    let upsertIgnore = false;
    let single = false;
    let limitTo = Infinity;
    let orderBy: { col: string; asc: boolean } | null = null;
    const missing = { data: null, error: { code: "42P01", message: "relation does not exist" } };
    const run = () => {
      if (options.missing && table === "jarvis_approvals") return missing;
      const store = data[table]!;
      if (op === "insert" || op === "upsert") {
        for (const row of rows) {
          const clash = store.find((item) => item.user_id === row.user_id && item.approval_key === row.approval_key);
          if (clash) {
            if (op === "upsert" && upsertIgnore) continue;
            return { data: null, error: { code: "23505", message: "duplicate key" } };
          }
          store.push({ status: "pending", decided_at: null, finished_at: null, result_url: null, created_at: new Date().toISOString(), id: crypto.randomUUID(), ...row });
        }
        return { data: null, error: null };
      }
      let hits = store.filter((row) => filters.every((test) => test(row)));
      if (op === "update") hits.forEach((row) => Object.assign(row, patch));
      if (orderBy) {
        const { col, asc } = orderBy;
        hits = [...hits].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
      }
      hits = hits.slice(0, limitTo).map((row) => ({ ...row }));
      return { data: single ? (hits[0] ?? null) : hits, error: null };
    };
    const builder = {
      select: () => builder,
      update: (value: Row) => { op = "update"; patch = value; return builder; },
      insert: (value: Row | Row[]) => { op = "insert"; rows = Array.isArray(value) ? value : [value]; return builder; },
      upsert: (value: Row[], opts: { ignoreDuplicates?: boolean }) => { op = "upsert"; rows = value; upsertIgnore = Boolean(opts?.ignoreDuplicates); return builder; },
      eq: (col: string, value: unknown) => { filters.push((row) => row[col] === value); return builder; },
      in: (col: string, values: unknown[]) => { filters.push((row) => values.includes(row[col])); return builder; },
      gt: (col: string, value: string) => { filters.push((row) => String(row[col]) > value); return builder; },
      lt: (col: string, value: string) => { filters.push((row) => row[col] != null && String(row[col]) < value); return builder; },
      order: (col: string, opts: { ascending: boolean }) => { orderBy = { col, asc: opts.ascending }; return builder; },
      limit: (n: number) => { limitTo = n; return builder; },
      maybeSingle: () => { single = true; return Promise.resolve(run()); },
      then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
    };
    return builder;
  }
  return { db: { from: query } as never, data };
}

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const MESSAGE = "33333333-3333-4333-8333-333333333333";
const research = { id: "research.ask", question: "Who are the top pressure washers in Raleigh?", preset: "fast" } as const;
const recover = { id: "builds.recover" } as const;
const reply = appendReplyMeta("Here's what I'd do.", { ran: [], proposals: [research, recover] as never });

describe("stable proposal hashing", () => {
  it("ignores key order and undefined values", async () => {
    expect(stableJson({ b: 1, a: [1, { d: 2, c: undefined }] })).toBe('{"a":[1,{"d":2}],"b":1}');
    expect(await proposalHash({ id: "x", a: 1, b: 2 })).toBe(await proposalHash({ b: 2, a: 1, id: "x" }));
    expect(await proposalHash({ id: "x", a: 1 })).not.toBe(await proposalHash({ id: "x", a: 2 }));
  });
});

describe("Jarvis approvals are single-use and bound to the proposal", () => {
  it("records one pending row per proposal and ignores replays", async () => {
    const { db, data } = fakeDb();
    expect(await recordProposals(db, OWNER, MESSAGE, null, reply)).toBe(2);
    await recordProposals(db, OWNER, MESSAGE, null, reply);
    expect(data.jarvis_approvals).toHaveLength(2);
    expect(data.jarvis_approvals.map((row) => row.approval_key)).toEqual([`${MESSAGE}:0`, `${MESSAGE}:1`]);
    expect(data.jarvis_approvals[0]!.summary).toBe(`research.ask: ${research.question}`);
    expect(await recordProposals(db, OWNER, MESSAGE, null, "No proposals here.")).toBe(0);
  });

  it("claims once, refuses a second claim, and remembers the result", async () => {
    const { db, data } = fakeDb();
    await recordProposals(db, OWNER, MESSAGE, null, reply);
    expect(await claimApproval(db, OWNER, `${MESSAGE}:0`, research)).toEqual({ ok: true });
    expect(await claimApproval(db, OWNER, `${MESSAGE}:0`, research)).toMatchObject({ ok: false, reason: "busy" });
    await finishApproval(db, OWNER, `${MESSAGE}:0`, true, "https://example.com/result");
    expect(data.jarvis_approvals[0]).toMatchObject({ status: "done", result_url: "https://example.com/result" });
    expect(await claimApproval(db, OWNER, `${MESSAGE}:0`, research)).toMatchObject({ ok: false, reason: "used" });
  });

  it("lets a failed action be retried, but never a finished one", async () => {
    const { db } = fakeDb();
    await recordProposals(db, OWNER, MESSAGE, null, reply);
    expect((await claimApproval(db, OWNER, `${MESSAGE}:1`, recover)).ok).toBe(true);
    await finishApproval(db, OWNER, `${MESSAGE}:1`, false);
    expect((await claimApproval(db, OWNER, `${MESSAGE}:1`, recover)).ok).toBe(true);
  });

  it("refuses arguments that differ from what Jarvis proposed", async () => {
    const { db } = fakeDb();
    await recordProposals(db, OWNER, MESSAGE, null, reply);
    const tampered = { ...research, question: "Email every lead in the CRM a promotion right now." };
    expect(await claimApproval(db, OWNER, `${MESSAGE}:0`, tampered)).toMatchObject({ ok: false, reason: "changed" });
    expect(await claimApproval(db, OWNER, `${MESSAGE}:0`, recover)).toMatchObject({ ok: false, reason: "changed" });
  });

  it("expires after 24 hours", async () => {
    const { db } = fakeDb();
    const start = Date.now();
    await recordProposals(db, OWNER, MESSAGE, null, reply, start);
    expect(await claimApproval(db, OWNER, `${MESSAGE}:0`, research, start + APPROVAL_TTL_MS + 1000)).toMatchObject({ ok: false, reason: "expired" });
  });

  it("frees a claim whose tab never reported back after 30 minutes", async () => {
    const { db } = fakeDb();
    const start = Date.now();
    await recordProposals(db, OWNER, MESSAGE, null, reply, start);
    expect((await claimApproval(db, OWNER, `${MESSAGE}:0`, research, start)).ok).toBe(true);
    expect((await claimApproval(db, OWNER, `${MESSAGE}:0`, research, start + 60_000)).ok).toBe(false);
    expect((await claimApproval(db, OWNER, `${MESSAGE}:0`, research, start + STALE_CLAIM_MS + 60_000)).ok).toBe(true);
  });

  it("can be dismissed, and a dismissed proposal can't be approved", async () => {
    const { db } = fakeDb();
    await recordProposals(db, OWNER, MESSAGE, null, reply);
    expect(await rejectApproval(db, OWNER, `${MESSAGE}:0`)).toBe(true);
    expect(await claimApproval(db, OWNER, `${MESSAGE}:0`, research)).toMatchObject({ ok: false, reason: "rejected" });
  });

  it("rejects malformed keys", async () => {
    const { db } = fakeDb();
    for (const key of ["", "abc", `${MESSAGE}:9`, `${MESSAGE}:0; drop table`]) {
      expect(await claimApproval(db, OWNER, key, research)).toMatchObject({ ok: false, reason: "invalid" });
    }
  });

  it("checks older replies (saved before the table) against the reply itself", async () => {
    const created = new Date().toISOString();
    const { db, data } = fakeDb({ jarvis_messages: [{ id: MESSAGE, user_id: OWNER, role: "assistant", content: reply, created_at: created, conversation_id: null }] });
    expect(await claimApproval(db, OWNER, `${MESSAGE}:0`, { ...research, preset: "medium" })).toMatchObject({ ok: false, reason: "changed" });
    expect(await claimApproval(db, OWNER, `${MESSAGE}:0`, research)).toEqual({ ok: true });
    expect(data.jarvis_approvals).toHaveLength(1);
    expect(await claimApproval(db, OWNER, `${MESSAGE}:0`, research)).toMatchObject({ ok: false, reason: "busy" });
    expect(await claimApproval(db, OWNER, `${MESSAGE}:4`, research)).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("keeps working, browser-only, before the migration is published", async () => {
    const { db } = fakeDb({}, { missing: true });
    expect(tableMissing({ code: "PGRST205" })).toBe(true);
    expect(await claimApproval(db, OWNER, `${MESSAGE}:0`, research)).toEqual({ ok: true });
    expect(await listApprovals(db, OWNER)).toEqual([]);
  });
});

describe("adversarial: one owner can never use or see another owner's approvals", () => {
  it("cannot claim, finish, dismiss or list another owner's proposal", async () => {
    const created = new Date().toISOString();
    const { db, data } = fakeDb({ jarvis_messages: [{ id: MESSAGE, user_id: OWNER, role: "assistant", content: reply, created_at: created, conversation_id: null }] });
    await recordProposals(db, OWNER, MESSAGE, null, reply);
    expect(await claimApproval(db, OTHER, `${MESSAGE}:0`, research)).toMatchObject({ ok: false, reason: "not_found" });
    await finishApproval(db, OTHER, `${MESSAGE}:0`, true);
    expect(await rejectApproval(db, OTHER, `${MESSAGE}:0`)).toBe(false);
    expect(await listApprovals(db, OTHER)).toEqual([]);
    expect(data.jarvis_approvals.every((row) => row.user_id === OWNER && row.status === "pending")).toBe(true);
    expect(await claimApproval(db, OWNER, `${MESSAGE}:0`, research)).toEqual({ ok: true });
  });

  it("the migration keeps the table server-only: RLS on, no browser writes, owner-only reads", () => {
    const sql = readFileSync("supabase/migrations/20261029150000_jarvis_approvals.sql", "utf8");
    expect(sql).toMatch(/alter table public\.jarvis_approvals enable row level security/i);
    expect(sql).toMatch(/revoke all on public\.jarvis_approvals from public, anon, authenticated/i);
    expect(sql).toMatch(/grant select on public\.jarvis_approvals to authenticated/i);
    expect(sql).not.toMatch(/grant (all|insert|update|delete)[^;]*jarvis_approvals[^;]*to (anon|authenticated)/i);
    expect(sql).toMatch(/using \(user_id = auth\.uid\(\) and private\.is_super_admin\(\)\)/i);
    expect(sql).not.toMatch(/for (all|insert|update|delete)/i);
  });

  it("lists waiting approvals first and marks lapsed ones expired", async () => {
    const { db } = fakeDb();
    const start = Date.now();
    await recordProposals(db, OWNER, MESSAGE, null, reply, start);
    await claimApproval(db, OWNER, `${MESSAGE}:1`, recover, start);
    await finishApproval(db, OWNER, `${MESSAGE}:1`, true, null, start);
    const items = await listApprovals(db, OWNER, start);
    expect(items.map((item) => item.state)).toEqual(["pending", "done"]);
    const later = await listApprovals(db, OWNER, start + APPROVAL_TTL_MS + 1);
    expect(later.find((item) => item.action_id === "research.ask")?.state).toBe("expired");
  });
});
