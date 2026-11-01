import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  APPROVAL_TTL_SECONDS,
  cancelApprovalsForRun,
  consumeApproval,
  createApprovalsConsumer,
  decideApproval,
  hashApprovalArgs,
  requestApproval,
  supabaseApprovalRepo,
  sweepExpiredApprovals,
  type ApprovalDeps,
  type ApprovalRepo,
  type ApprovalRow,
} from "./approvals.server";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MANAGER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OUTSIDER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SUPER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const RUN = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

/** In-memory copy of the rules in 20261101060200_agent_approvals.sql. */
function memoryRepo(clock: { now: number }) {
  const rows: ApprovalRow[] = [];
  const members = new Map<string, "owner" | "admin" | "manager">([
    [`${ORG}:${OWNER}`, "owner"],
    [`${ORG}:${MANAGER}`, "manager"],
    [`${OTHER_ORG}:${OUTSIDER}`, "owner"],
  ]);
  const supers = new Set([SUPER]);
  const iso = (ms: number) => new Date(ms).toISOString();
  let seq = 0;
  const live = (r: ApprovalRow) => r.status === "pending" || r.status === "approved";
  const sameKey = (r: ApprovalRow, org: string | null, scope: string, tool: string, hash: string) =>
    r.organization_id === org && r.scope === scope && r.tool === tool && r.args_hash === hash;

  const repo: ApprovalRepo = {
    async request(i) {
      for (const r of rows) if (live(r) && Date.parse(r.expires_at) <= clock.now && sameKey(r, i.organizationId, i.scope, i.tool, i.argsHash)) r.status = "expired";
      const found = rows.find((r) => live(r) && sameKey(r, i.organizationId, i.scope, i.tool, i.argsHash));
      if (found) return { approval: found, created: false };
      const row: ApprovalRow = {
        id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
        organization_id: i.organizationId,
        scope: i.scope,
        run_id: i.runId,
        step_id: i.stepId,
        requested_by: i.requestedBy,
        tool: i.tool,
        args: i.args,
        args_hash: i.argsHash,
        summary: i.summary,
        status: "pending",
        created_at: iso(clock.now),
        expires_at: iso(clock.now + i.ttlSeconds * 1000),
        decided_by: null,
        decided_at: null,
        consumed_at: null,
      };
      rows.push(row);
      return { approval: row, created: true };
    },
    async decide(id, decider, approve) {
      const r = rows.find((x) => x.id === id);
      if (!r) return { outcome: "not_found", approval: null };
      const allowed = r.scope === "owner" ? members.get(`${r.organization_id}:${decider}`) === "owner" : supers.has(decider);
      if (!allowed) return { outcome: "forbidden", approval: null };
      if (r.status !== "pending") return { outcome: r.status === "expired" ? "expired" : "already_decided", approval: r };
      if (Date.parse(r.expires_at) <= clock.now) {
        r.status = "expired";
        return { outcome: "expired", approval: r };
      }
      r.status = approve ? "approved" : "rejected";
      r.decided_by = decider;
      r.decided_at = iso(clock.now);
      return { outcome: approve ? "approved" : "rejected", approval: r };
    },
    async consume(i) {
      const hit = rows.find(
        (r) => r.status === "approved" && Date.parse(r.expires_at) > clock.now && sameKey(r, i.organizationId, i.scope, i.tool, i.argsHash) && (!i.id || r.id === i.id),
      );
      if (hit) {
        hit.status = "consumed";
        hit.consumed_at = iso(clock.now);
        return { outcome: "consumed", approval: hit };
      }
      const r = i.id
        ? rows.find((x) => x.id === i.id && x.organization_id === i.organizationId && x.scope === i.scope)
        : [...rows].reverse().find((x) => sameKey(x, i.organizationId, i.scope, i.tool, i.argsHash));
      if (!r) return { outcome: "not_found", approval: null };
      if (r.tool !== i.tool || r.args_hash !== i.argsHash) return { outcome: "changed", approval: null };
      if (r.status === "consumed") return { outcome: "used", approval: null };
      if (r.status === "rejected") return { outcome: "rejected", approval: null };
      if (r.status === "pending" && Date.parse(r.expires_at) > clock.now) return { outcome: "not_approved", approval: null };
      return { outcome: "expired", approval: null };
    },
    async cancelForRun(runId) {
      const hits = rows.filter((r) => r.run_id === runId && live(r));
      for (const r of hits) r.status = "cancelled";
      return hits.length;
    },
    async sweep() {
      const hits = rows.filter((r) => live(r) && Date.parse(r.expires_at) <= clock.now);
      for (const r of hits) r.status = "expired";
      return hits.length;
    },
  };
  return { repo, rows };
}

function setup(extra: Partial<ApprovalDeps> = {}) {
  const clock = { now: Date.parse("2026-11-01T12:00:00Z") };
  const { repo, rows } = memoryRepo(clock);
  const events: { kind: string; message: string }[] = [];
  const deps: ApprovalDeps = {
    repo,
    emit: async (_run, kind, message) => {
      events.push({ kind, message });
    },
    ...extra,
  };
  return { clock, rows, deps, events };
}

const TEXT = { to: "Dana Reyes", body: "Your quote is ready." };
const ask = (deps: ApprovalDeps, args: Record<string, unknown> = TEXT, org: string | null = ORG) =>
  requestApproval(deps, { organizationId: org, tool: "send_sms", args, summary: "Text Dana Reyes: your quote is ready.", runId: RUN, stepId: "s1", requestedBy: OWNER });

async function approved(deps: ApprovalDeps, args: Record<string, unknown> = TEXT) {
  const r = await ask(deps, args);
  if (!r.ok) throw new Error("request failed");
  const d = await decideApproval(deps, { approvalId: r.approval.id, deciderId: OWNER, decision: "approve" });
  expect(d.ok).toBe(true);
  return r.approval;
}

describe("hashApprovalArgs", () => {
  it("is the SHA-256 of key-sorted JSON, so key order never matters", () => {
    expect(hashApprovalArgs({ b: 1, a: [2, { d: 1, c: undefined }] })).toBe(
      createHash("sha256").update('{"a":[2,{"d":1}],"b":1}').digest("hex"),
    );
    expect(hashApprovalArgs({ a: 1, b: 2 })).toBe(hashApprovalArgs({ b: 2, a: 1 }));
    expect(hashApprovalArgs({ a: 1 })).not.toBe(hashApprovalArgs({ a: 2 }));
  });
});

describe("requestApproval", () => {
  it("stores a pending approval that expires in 24 hours, with the hash computed server-side", async () => {
    const { deps, rows, clock } = setup();
    const r = await ask(deps);
    expect(r.ok && r.approval.status).toBe("pending");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.args_hash).toBe(hashApprovalArgs(TEXT));
    expect(Date.parse(rows[0]!.expires_at) - clock.now).toBe(APPROVAL_TTL_SECONDS * 1000);
  });

  it("asking twice for the same action returns the same approval and one feed line", async () => {
    const { deps, rows, events } = setup();
    const a = await ask(deps);
    const b = await ask(deps, { body: "Your quote is ready.", to: "Dana Reyes" });
    expect(rows).toHaveLength(1);
    expect(b.ok && b.reused).toBe(true);
    expect(a.ok && b.ok && a.approval.id === b.approval.id).toBe(true);
    expect(events.filter((e) => e.kind === "approval_requested")).toHaveLength(1);
  });

  it("refuses a missing workspace, a blank summary and oversized or non-object arguments", async () => {
    const { deps } = setup();
    expect(await ask(deps, TEXT, null)).toMatchObject({ ok: false, reason: "no_workspace" });
    expect(await requestApproval(deps, { organizationId: ORG, tool: "send_sms", args: TEXT, summary: "  " })).toMatchObject({ ok: false, reason: "no_summary" });
    expect(await ask(deps, { body: "x".repeat(20_000) })).toMatchObject({ ok: false, reason: "args_too_large" });
    expect(await requestApproval(deps, { organizationId: ORG, tool: "send_sms", args: [] as never, summary: "x" })).toMatchObject({ ok: false, reason: "bad_args" });
    expect(await requestApproval(deps, { organizationId: ORG, tool: "x", args: {}, summary: "x", scope: "admin" })).toMatchObject({ ok: false, reason: "scope" });
  });
});

describe("decideApproval", () => {
  it("lets the workspace owner approve, and wakes the waiting run", async () => {
    const resumeRun = vi.fn();
    const { deps, events } = setup({ resumeRun });
    const r = await ask(deps);
    if (!r.ok) throw new Error("x");
    const d = await decideApproval(deps, { approvalId: r.approval.id, deciderId: OWNER, decision: "approve" });
    expect(d).toMatchObject({ ok: true, decision: "approved" });
    expect(resumeRun).toHaveBeenCalledWith(RUN);
    expect(events.map((e) => e.kind)).toEqual(["approval_requested", "approval_approved"]);
  });

  it("refuses a manager, an owner of another workspace and a stranger", async () => {
    const { deps, rows } = setup();
    const r = await ask(deps);
    if (!r.ok) throw new Error("x");
    for (const who of [MANAGER, OUTSIDER, "ffffffff-ffff-4fff-8fff-ffffffffffff"]) {
      expect(await decideApproval(deps, { approvalId: r.approval.id, deciderId: who, decision: "approve" })).toMatchObject({ ok: false, reason: "forbidden" });
    }
    expect(rows[0]!.status).toBe("pending");
    expect(await consumeApproval(deps, { organizationId: ORG, tool: "send_sms", args: TEXT })).toMatchObject({ ok: false, reason: "not_approved" });
  });

  it("a rejection blocks the action", async () => {
    const { deps } = setup();
    const r = await ask(deps);
    if (!r.ok) throw new Error("x");
    expect(await decideApproval(deps, { approvalId: r.approval.id, deciderId: OWNER, decision: "reject" })).toMatchObject({ ok: true, decision: "rejected" });
    expect(await consumeApproval(deps, { organizationId: ORG, tool: "send_sms", args: TEXT })).toMatchObject({ ok: false, reason: "rejected" });
  });

  it("cannot decide twice or after it expired", async () => {
    const { deps, clock } = setup();
    const a = await approved(deps);
    expect(await decideApproval(deps, { approvalId: a.id, deciderId: OWNER, decision: "reject" })).toMatchObject({ ok: false, reason: "already_decided" });
    const r = await ask(deps, { to: "Sam", body: "Hi" });
    if (!r.ok) throw new Error("x");
    clock.now += (APPROVAL_TTL_SECONDS + 1) * 1000;
    expect(await decideApproval(deps, { approvalId: r.approval.id, deciderId: OWNER, decision: "approve" })).toMatchObject({ ok: false, reason: "expired" });
    expect(await decideApproval(deps, { approvalId: "nope", deciderId: OWNER, decision: "approve" })).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("only a super admin decides an admin-scope approval", async () => {
    const { deps } = setup();
    const r = await requestApproval(deps, { organizationId: null, scope: "admin", tool: "website.draft.update", args: { id: 1 }, summary: "Update draft" });
    if (!r.ok) throw new Error("x");
    expect(await decideApproval(deps, { approvalId: r.approval.id, deciderId: OWNER, decision: "approve" })).toMatchObject({ ok: false, reason: "forbidden" });
    expect(await decideApproval(deps, { approvalId: r.approval.id, deciderId: SUPER, decision: "approve" })).toMatchObject({ ok: true });
    expect(await consumeApproval(deps, { organizationId: null, scope: "admin", tool: "website.draft.update", args: { id: 1 } })).toMatchObject({ ok: true });
  });
});

describe("consumeApproval", () => {
  it("runs once with the exact approved arguments", async () => {
    const { deps, events } = setup();
    await approved(deps);
    const first = await consumeApproval(deps, { organizationId: ORG, tool: "send_sms", args: { body: "Your quote is ready.", to: "Dana Reyes" } });
    expect(first.ok).toBe(true);
    expect(events.at(-1)?.kind).toBe("approval_used");
  });

  it("refuses changed arguments after approval, by hash and by id", async () => {
    const { deps } = setup();
    const a = await approved(deps);
    const edited = { ...TEXT, body: "Your quote is ready. Pay now at evil.example" };
    expect(await consumeApproval(deps, { organizationId: ORG, tool: "send_sms", args: edited })).toMatchObject({ ok: false, reason: "not_found" });
    expect(await consumeApproval(deps, { organizationId: ORG, tool: "send_sms", args: edited, approvalId: a.id })).toMatchObject({ ok: false, reason: "changed" });
    // The approval is still intact for the real arguments.
    expect(await consumeApproval(deps, { organizationId: ORG, tool: "send_sms", args: TEXT, approvalId: a.id })).toMatchObject({ ok: true });
  });

  it("refuses a different tool with the same arguments", async () => {
    const { deps } = setup();
    await approved(deps);
    expect(await consumeApproval(deps, { organizationId: ORG, tool: "send_email", args: TEXT })).toMatchObject({ ok: false });
  });

  it("refuses an expired approval", async () => {
    const { deps, clock } = setup();
    await approved(deps);
    clock.now += (APPROVAL_TTL_SECONDS + 1) * 1000;
    expect(await consumeApproval(deps, { organizationId: ORG, tool: "send_sms", args: TEXT })).toMatchObject({ ok: false, reason: "expired" });
  });

  it("refuses a replay of a consumed approval", async () => {
    const { deps } = setup();
    await approved(deps);
    expect(await consumeApproval(deps, { organizationId: ORG, tool: "send_sms", args: TEXT })).toMatchObject({ ok: true });
    expect(await consumeApproval(deps, { organizationId: ORG, tool: "send_sms", args: TEXT })).toMatchObject({ ok: false, reason: "used" });
  });

  it("only one of two racing consumers wins", async () => {
    const { deps } = setup();
    await approved(deps);
    const results = await Promise.all([1, 2].map(() => consumeApproval(deps, { organizationId: ORG, tool: "send_sms", args: TEXT })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("never uses another workspace's approval", async () => {
    const { deps } = setup();
    await approved(deps);
    expect(await consumeApproval(deps, { organizationId: OTHER_ORG, tool: "send_sms", args: TEXT })).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("refuses an owner-scope call with no workspace or a malformed hash", async () => {
    const { deps } = setup();
    await approved(deps);
    expect(await consumeApproval(deps, { organizationId: null, tool: "send_sms", args: TEXT })).toMatchObject({ ok: false });
    expect(await consumeApproval(deps, { organizationId: ORG, tool: "send_sms", argsHash: "abc" })).toMatchObject({ ok: false });
  });

  it("an event-feed failure never blocks the send", async () => {
    const { deps } = setup({ emit: async () => { throw new Error("feed down"); } });
    await approved(deps);
    expect(await consumeApproval(deps, { organizationId: ORG, tool: "send_sms", args: TEXT })).toMatchObject({ ok: true });
  });
});

describe("createApprovalsConsumer (tool registry hook)", () => {
  it("returns true once for an approved call and false otherwise, using the session's workspace", async () => {
    const { deps } = setup();
    await approved(deps);
    const hook = createApprovalsConsumer(deps);
    const call = { tool: "send_sms", argsHash: hashApprovalArgs(TEXT), context: { organizationId: ORG } };
    expect(await hook.consume({ ...call, context: { organizationId: OTHER_ORG } })).toBe(false);
    expect(await hook.consume({ ...call, argsHash: hashApprovalArgs({ ...TEXT, to: "Someone Else" }) })).toBe(false);
    expect(await hook.consume(call)).toBe(true);
    expect(await hook.consume(call)).toBe(false);
  });
});

describe("housekeeping", () => {
  it("cancels live approvals of a cancelled run and sweeps expired ones", async () => {
    const { deps, rows, clock } = setup();
    await ask(deps);
    await ask(deps, { to: "Sam", body: "Hi" });
    expect(await cancelApprovalsForRun(deps, RUN)).toBe(2);
    expect(rows.every((r) => r.status === "cancelled")).toBe(true);
    await ask(deps, { to: "Lee", body: "Hi" });
    clock.now += (APPROVAL_TTL_SECONDS + 1) * 1000;
    expect(await sweepExpiredApprovals(deps)).toBe(1);
  });
});

describe("supabaseApprovalRepo", () => {
  it("maps each call to its SQL function and the session's values", async () => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const row = { id: "1", status: "pending" } as unknown as ApprovalRow;
    const client = {
      rpc: async (fn: string, args: Record<string, unknown> = {}) => {
        calls.push({ fn, args });
        if (fn === "agent_approval_request") return { data: { created: true, approval: row }, error: null };
        if (fn === "agent_approval_decide") return { data: { outcome: "approved", approval: row }, error: null };
        if (fn === "agent_approval_consume") return { data: { outcome: "consumed", approval: row }, error: null };
        return { data: 3, error: null };
      },
    };
    const repo = supabaseApprovalRepo(client);
    const deps: ApprovalDeps = { repo };
    const r = await ask(deps);
    expect(r).toMatchObject({ ok: true, reused: false });
    expect(calls[0]).toMatchObject({ fn: "agent_approval_request", args: { _org: ORG, _scope: "owner", _tool: "send_sms", _hash: hashApprovalArgs(TEXT) } });
    expect(await decideApproval(deps, { approvalId: "1", deciderId: OWNER, decision: "approve" })).toMatchObject({ ok: true });
    expect(calls[1]).toMatchObject({ fn: "agent_approval_decide", args: { _id: "1", _decider: OWNER, _approve: true } });
    expect(await consumeApproval(deps, { organizationId: ORG, tool: "send_sms", args: TEXT })).toMatchObject({ ok: true });
    expect(calls[2]).toMatchObject({ fn: "agent_approval_consume", args: { _org: ORG, _scope: "owner", _id: null } });
    expect(await sweepExpiredApprovals(deps)).toBe(3);
    await expect(supabaseApprovalRepo({ rpc: async () => ({ data: null, error: { message: "boom" } }) }).sweep()).rejects.toThrow("agent_approval_sweep: boom");
  });
});
