import { describe, expect, it } from "vitest";
import type { ApprovalDeps, ApprovalRepo, ApprovalRow } from "./approvals.server";
import { consumeJarvisWriteApproval, jarvisApprovalArgs } from "./jarvis-approval-bridge.server";

const ADMIN = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const MEMBER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const KEY = "11111111-1111-4111-8111-111111111111:0";
const proposal = { id: "website.draft.update", input: { businessName: "Acme" } };

/** The admin-scope rules of 20261103020000_agent_approvals.sql, in memory. */
function fakeRepo(opts: { supers?: string[]; failWith?: string } = {}) {
  const rows: ApprovalRow[] = [];
  const supers = new Set(opts.supers ?? [ADMIN]);
  const fail = () => {
    if (opts.failWith) throw new Error(opts.failWith);
  };
  const live = (r: ApprovalRow) => r.status === "pending" || r.status === "approved";
  const repo: ApprovalRepo = {
    async request(i) {
      fail();
      const found = rows.find((r) => live(r) && r.tool === i.tool && r.args_hash === i.argsHash);
      if (found) return { approval: found, created: false };
      const row = {
        id: `00000000-0000-4000-8000-00000000000${rows.length + 1}`,
        organization_id: null,
        scope: i.scope,
        run_id: null,
        step_id: null,
        requested_by: i.requestedBy,
        tool: i.tool,
        args: i.args,
        args_hash: i.argsHash,
        summary: i.summary,
        status: "pending",
        created_at: "",
        expires_at: "",
        decided_by: null,
        decided_at: null,
        consumed_at: null,
      } as ApprovalRow;
      rows.push(row);
      return { approval: row, created: true };
    },
    async decide(id, decider, approve) {
      const r = rows.find((x) => x.id === id);
      if (!r) return { outcome: "not_found", approval: null };
      if (!supers.has(decider)) return { outcome: "forbidden", approval: null };
      if (r.status !== "pending") return { outcome: "already_decided", approval: r };
      r.status = approve ? "approved" : "rejected";
      return { outcome: approve ? "approved" : "rejected", approval: r };
    },
    async consume(i) {
      const hit = rows.find(
        (r) =>
          r.status === "approved" &&
          r.tool === i.tool &&
          r.args_hash === i.argsHash &&
          r.scope === i.scope &&
          (!i.id || r.id === i.id),
      );
      if (!hit) return { outcome: "not_found", approval: null };
      hit.status = "consumed";
      return { outcome: "consumed", approval: hit };
    },
    async cancelForRun() {
      return 0;
    },
    async sweep() {
      return 0;
    },
  };
  return { rows, deps: { repo } as ApprovalDeps };
}

const run = (deps: ApprovalDeps, userId = ADMIN, p: { id: string } = proposal) =>
  consumeJarvisWriteApproval(deps, {
    userId,
    key: KEY,
    proposal: p,
    summary: "website.draft.update: Acme",
  });

describe("Jarvis writes through the shared consume step", () => {
  it("an approving super admin gets a recorded, consumed admin-scope approval", async () => {
    const { rows, deps } = fakeRepo();
    const out = await run(deps);
    expect(out).toMatchObject({ ok: true, recorded: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      scope: "admin",
      organization_id: null,
      tool: "jarvis.website.draft.update",
      status: "consumed",
    });
  });

  it("stores a small binding record, not the proposal itself", async () => {
    const { rows, deps } = fakeRepo();
    await run(deps);
    expect(rows[0]!.args).toEqual(jarvisApprovalArgs(KEY, proposal));
    expect(JSON.stringify(rows[0]!.args)).not.toContain("Acme");
  });

  it("a user who isn't a super admin is refused and nothing is consumed", async () => {
    const { rows, deps } = fakeRepo();
    const out = await run(deps, MEMBER);
    expect(out).toMatchObject({ ok: false, reason: "forbidden" });
    expect(rows[0]!.status).toBe("pending");
  });

  it("a different proposal under the same key gets its own approval, so a change can't reuse the old one", async () => {
    const { rows, deps } = fakeRepo();
    await run(deps);
    await run(deps, ADMIN, {
      id: "website.draft.update",
      input: { businessName: "Other" },
    } as never);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.args_hash).not.toBe(rows[1]!.args_hash);
  });

  it("an outage in the shared store is reported as unavailable, never as a recorded approval", async () => {
    const { deps } = fakeRepo({ failWith: "rpc down" });
    expect(await run(deps)).toEqual({ ok: true, recorded: false, reason: "unavailable" });
  });

  it("a consume refusal blocks (an approval already used)", async () => {
    const { rows, deps } = fakeRepo();
    const orig = deps.repo.consume;
    deps.repo.consume = async (i) => ({ ...(await orig(i)), outcome: "used" });
    const out = await run(deps);
    expect(out).toMatchObject({ ok: false, reason: "used" });
    expect(rows).toHaveLength(1);
  });
});
