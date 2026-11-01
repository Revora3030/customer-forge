import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { actionRequestSchema, payloadLooksSecret, publicBuildStatus, type ActionRequestRow } from "./agent-gateway";
import { GATEWAY_LEVELS, LEVEL4_ACTION_KINDS, isLevel4Action } from "./agent-authority";
import {
  ActionRequestError,
  botView,
  completeActionRequest,
  createActionRequest,
  decideActionRequest,
  listActionRequests,
  pendingActionRequestCount,
  readActionRequest,
} from "./agent-action-requests.server";
import { agentHealth, briefingText } from "./agent-gateway.server";

/* A tiny in-memory stand-in for the one table these functions touch. */
type Row = Record<string, unknown>;
function fakeDb(rows: Row[] = []) {
  let seq = 0;
  const db = {
    rows,
    from(name: string) {
      if (name !== "agent_action_requests") throw new Error(`unexpected table ${name}`);
      const filters: ((row: Row) => boolean)[] = [];
      let mode: "select" | "update" | "insert" = "select";
      let patch: Row = {};
      let inserted: Row | null = null;
      let head = false;
      const run = () => {
        if (mode === "insert") {
          const dup = rows.find((r) => r["requested_by"] === inserted!["requested_by"] && r["idempotency_key"] === inserted!["idempotency_key"]);
          if (dup) return { data: null, error: { code: "23505" } };
          const row = {
            id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
            status: "pending",
            decided_at: null,
            decision_note: null,
            completed_at: null,
            result_url: null,
            result_note: null,
            ...inserted,
          };
          rows.push(row);
          return { data: [row], error: null };
        }
        const hit = rows.filter((row) => filters.every((f) => f(row)));
        if (mode === "update") hit.forEach((row) => Object.assign(row, patch));
        return { data: hit.map((row) => ({ ...row })), error: null, count: hit.length };
      };
      const chain: Record<string, unknown> = {
        select: (_cols?: string, opts?: { head?: boolean }) => ((head = Boolean(opts?.head)), chain),
        insert: (row: Row) => ((mode = "insert"), (inserted = row), chain),
        update: (row: Row) => ((mode = "update"), (patch = row), chain),
        eq: (key: string, value: unknown) => (filters.push((row) => row[key] === value), chain),
        gt: (key: string, value: string) => (filters.push((row) => String(row[key]) > value), chain),
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          const r = run();
          return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error };
        },
        single: async () => {
          const r = run();
          return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error };
        },
        then: (resolve: (value: unknown) => void) => {
          const r = run();
          resolve(head ? { count: r.count ?? 0, error: r.error } : r);
        },
      };
      return chain;
    },
  };
  return db;
}

/**
 * The shape the live backend returns when the table isn't there yet: a head
 * count comes back with no number and no error, a full read with PGRST205.
 */
function missingTableDb() {
  let head = false;
  const chain: Record<string, unknown> = {
    select: (_cols?: string, opts?: { head?: boolean }) => ((head = Boolean(opts?.head)), chain),
    eq: () => chain,
    gt: () => chain,
    gte: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: null, error: { code: "PGRST205" } }),
    single: async () => ({ data: null, error: { code: "PGRST205" } }),
    then: (resolve: (value: unknown) => void) =>
      resolve(head ? { count: null, error: null } : { data: null, error: { code: "PGRST205" }, count: null }),
  };
  return { from: () => chain };
}

const base = {
  kind: "merge_pull_request" as const,
  title: "Merge #400: fix booking form",
  idempotency_key: "grok-pr-400-v1",
  requested_by: "grok",
  evidence: { task_id: "T-400", affected_files: ["src/x.ts"], tests: { passed: 10, failed: 0 }, typecheck: "passed" as const, build: "passed" as const },
};
const NOW = Date.parse("2026-10-30T12:00:00Z");

describe("action request schema", () => {
  it("accepts only Level 4 kinds", () => {
    expect(actionRequestSchema.safeParse(base).success).toBe(true);
    expect(actionRequestSchema.safeParse({ ...base, kind: "read_logs" }).success).toBe(false);
    expect(isLevel4Action("publish_site")).toBe(true);
    expect(isLevel4Action("drop_tables")).toBe(false);
  });

  it("requires an evidence card before a merge", () => {
    const { evidence: _evidence, ...bare } = base;
    expect(actionRequestSchema.safeParse(bare).success).toBe(false);
    expect(actionRequestSchema.safeParse({ ...bare, kind: "publish_site" }).success).toBe(true);
  });

  it("refuses non-https links and unknown fields", () => {
    expect(actionRequestSchema.safeParse({ ...base, target_url: "http://github.com/x" }).success).toBe(false); // DevSkim: ignore DS137138 - intentional plain-http input, must be rejected
    expect(actionRequestSchema.safeParse({ ...base, execute_now: true }).success).toBe(false);
  });

  it("spots credentials in a payload", () => {
    expect(payloadLooksSecret({ pr: 400 })).toBe(false);
    expect(payloadLooksSecret({ api_key: "x" })).toBe(true);
    expect(payloadLooksSecret({ note: "sk_live_abc" })).toBe(true);
  });

  it("matches the kinds the database accepts", () => {
    const sql = readFileSync("supabase/migrations/20261030090000_agent_action_requests.sql", "utf8");
    for (const kind of LEVEL4_ACTION_KINDS) expect(sql).toContain(`'${kind}'`);
  });
});

describe("approval queue", () => {
  it("makes one request per idempotency key, however often the bot retries", async () => {
    const db = fakeDb();
    const first = await createActionRequest(db as never, actionRequestSchema.parse(base), NOW);
    const again = await createActionRequest(db as never, actionRequestSchema.parse(base), NOW);
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.request.id).toBe(first.request.id);
    expect(db.rows).toHaveLength(1);
  });

  it("never lets the bot act before the founder approves", async () => {
    const db = fakeDb();
    const { request } = await createActionRequest(db as never, actionRequestSchema.parse(base), NOW);
    expect(botView(request, "https://x.test").mayExecute).toBe(false);
    await expect(completeActionRequest(db as never, { id: request.id, ok: true }, NOW)).rejects.toBeInstanceOf(ActionRequestError);
    const approved = await decideActionRequest(db as never, { id: request.id, approve: true, userId: "u1" }, NOW + 1000);
    expect(botView(approved, "https://x.test")).toMatchObject({ mayExecute: true, approvalUrl: `https://x.test/admin/approvals?request=${request.id}` });
    const done = await completeActionRequest(db as never, { id: request.id, ok: true, resultUrl: "https://github.com/pr/400" }, NOW + 2000);
    expect(done.state).toBe("completed");
    expect(botView(done, "https://x.test").mayExecute).toBe(false);
  });

  it("decides a request once, and never after it expires", async () => {
    const db = fakeDb();
    const { request } = await createActionRequest(db as never, actionRequestSchema.parse(base), NOW);
    await decideActionRequest(db as never, { id: request.id, approve: false, userId: "u1" }, NOW);
    await expect(decideActionRequest(db as never, { id: request.id, approve: true, userId: "u1" }, NOW)).rejects.toThrow(/already rejected/);

    const late = await createActionRequest(db as never, actionRequestSchema.parse({ ...base, idempotency_key: "grok-pr-401-v1" }), NOW);
    await expect(decideActionRequest(db as never, { id: late.request.id, approve: true, userId: "u1" }, NOW + 49 * 3_600_000)).rejects.toThrow(/expired/);
    expect((await readActionRequest(db as never, late.request.id, NOW + 49 * 3_600_000))?.state).toBe("expired");
  });

  it("caps how many requests can wait at once", async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: `p${i}`, requested_by: "grok", idempotency_key: `k-${i}-xxxxxx`, status: "pending", expires_at: "2099-01-01T00:00:00Z" }));
    const db = fakeDb(rows);
    await expect(createActionRequest(db as never, actionRequestSchema.parse({ ...base, idempotency_key: "grok-new-one" }), NOW)).rejects.toMatchObject({ status: 429 });
  });

  it("rejects malformed ids without touching the table", async () => {
    const db = fakeDb();
    expect(await readActionRequest(db as never, "not-a-uuid")).toBeNull();
    await expect(decideActionRequest(db as never, { id: "1; drop", approve: true, userId: "u" })).rejects.toMatchObject({ status: 400 });
  });
});

describe("agent_action_requests migration", () => {
  const sql = readFileSync("supabase/migrations/20261030090000_agent_action_requests.sql", "utf8");
  it("keeps the table server-only: RLS on, no browser writes, super-admin reads", () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON public\.agent_action_requests FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT SELECT ON public\.agent_action_requests TO authenticated;/);
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*TO (anon|authenticated)/i);
    expect(sql).toMatch(/FOR SELECT TO authenticated\s+USING \(private\.is_super_admin\(\)\)/);
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/i);
  });

  it("changes no other table", () => {
    const touched = [...sql.matchAll(/(?:TABLE|ON)\s+(?:IF NOT EXISTS\s+)?public\.(\w+)/gi)].map((m) => m[1]);
    expect(new Set(touched)).toEqual(new Set(["agent_action_requests"]));
  });
});

describe("gateway read shapes", () => {
  it("strips emails from build errors and clamps progress", () => {
    const view = publicBuildStatus({ id: "j1", status: "failed", progress: 140, error_message: "mail owner@biz.com failed", stage_checkpoints: { copy: {}, layout: {} } });
    expect(view.error).toBe("mail [email] failed");
    expect(view.progress).toBe(100);
    expect(view.checkpoints).toEqual(["copy", "layout"]);
    expect(Object.keys(view)).not.toContain("steps");
    expect(view.buildSteps.length).toBeGreaterThan(5);
    expect(view.failedStep).toBeNull();
  });

  it("says unknown, never zero, when a number can't be read", () => {
    const text = briefingText({
      health: { checkedAt: "", activeBuilds: 1, failedBuilds24h: 0, leadsAwaitingReview: null, errors24h: 3, approvalsWaiting: 2, note: "" },
      analytics: null,
    });
    expect(text).toContain("2 requests are waiting");
    expect(text).toContain("an unknown number of leads are waiting");
    expect(text).toContain("Revenue numbers could not be read");
  });

  it("puts every write route at Level 3 and reads at Level 1", () => {
    for (const [route, level] of Object.entries(GATEWAY_LEVELS)) expect(level).toBe(route.startsWith("GET") ? 1 : 3);
  });
});

describe("when the queue isn't live yet", () => {
  it("says the count is unknown instead of reporting zero approvals waiting", async () => {
    expect(await pendingActionRequestCount(missingTableDb() as never, NOW)).toBeNull();
  });

  it("refuses to show an empty inbox for a queue it can't read", async () => {
    await expect(listActionRequests(missingTableDb() as never, NOW)).rejects.toMatchObject({ status: 503 });
  });

  it("won't pretend a request was saved when the table is missing", async () => {
    await expect(createActionRequest(missingTableDb() as never, actionRequestSchema.parse(base), NOW)).rejects.toMatchObject({ status: 503 });
  });

  it("reports every health number as unknown rather than zero", async () => {
    const health = await agentHealth(missingTableDb() as never, new Date(NOW));
    expect(health).toMatchObject({ activeBuilds: null, failedBuilds24h: null, leadsAwaitingReview: null, errors24h: null, approvalsWaiting: null });
  });
});

export type _Row = ActionRequestRow;
