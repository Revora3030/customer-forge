import { describe, expect, it, vi } from "vitest";
import { decideForOrganization, listWaitingApprovals } from "./approvals-owner.server";
import type { ApprovalDeps, ApprovalRow } from "./approvals.server";

function queryClient(rows: Partial<ApprovalRow>[], error: { message: string } | null = null) {
  const filters: [string, unknown][] = [];
  const chain: Record<string, unknown> = {};
  const done = () => ({ data: rows, error });
  for (const m of ["select", "eq", "gt", "order", "limit"]) {
    chain[m] = (...a: unknown[]) => {
      if (m === "eq" || m === "gt") filters.push([String(a[0]), a[1]]);
      return chain;
    };
  }
  chain["maybeSingle"] = async () => ({ data: rows[0] ?? null, error });
  chain["then"] = (resolve: (v: unknown) => unknown) => resolve(done());
  return { client: { from: vi.fn(() => chain) }, filters };
}

describe("listWaitingApprovals", () => {
  it("asks only for this workspace's live owner-scope pending rows", async () => {
    const { client, filters } = queryClient([{ id: "a" }]);
    const out = await listWaitingApprovals(client, "org-1", new Date("2026-11-05T12:00:00Z"));
    expect(out).toHaveLength(1);
    expect(filters).toContainEqual(["organization_id", "org-1"]);
    expect(filters).toContainEqual(["scope", "owner"]);
    expect(filters).toContainEqual(["status", "pending"]);
    expect(filters).toContainEqual(["expires_at", "2026-11-05T12:00:00.000Z"]);
  });

  it("fails with a plain message on a database error", async () => {
    await expect(
      listWaitingApprovals(queryClient([], { message: "boom secret detail" }).client, "org-1"),
    ).rejects.toThrow("Couldn't load approvals.");
  });
});

describe("decideForOrganization", () => {
  const deps = (decide: ReturnType<typeof vi.fn>): ApprovalDeps => ({ repo: { decide } as never });

  it("does not decide an approval that isn't in the named workspace", async () => {
    const decide = vi.fn();
    const { client } = queryClient([]);
    const result = await decideForOrganization(client, deps(decide), {
      organizationId: "org-1",
      approvalId: "other-org-row",
      deciderId: "u1",
      approve: true,
    });
    expect(result).toMatchObject({ ok: false, reason: "not_found" });
    expect(decide).not.toHaveBeenCalled();
  });

  it("passes the signed-in user as the decider and maps approve/reject", async () => {
    const approval = { id: "a1", run_id: null, summary: "s", tool: "send_sms" } as ApprovalRow;
    const decide = vi.fn(async (_id: string, _by: string, approve: boolean) => ({
      outcome: approve ? "approved" : "rejected",
      approval,
    }));
    const { client } = queryClient([{ id: "a1" }]);
    const yes = await decideForOrganization(client, deps(decide), {
      organizationId: "org-1",
      approvalId: "a1",
      deciderId: "owner-1",
      approve: true,
    });
    const no = await decideForOrganization(client, deps(decide), {
      organizationId: "org-1",
      approvalId: "a1",
      deciderId: "owner-1",
      approve: false,
    });
    expect(yes).toMatchObject({ ok: true, decision: "approved" });
    expect(no).toMatchObject({ ok: true, decision: "rejected" });
    expect(decide).toHaveBeenCalledWith("a1", "owner-1", true);
  });

  it("returns the database's refusal for a non-owner", async () => {
    const decide = vi.fn(async () => ({ outcome: "forbidden", approval: null }));
    const { client } = queryClient([{ id: "a1" }]);
    const result = await decideForOrganization(client, deps(decide), {
      organizationId: "org-1",
      approvalId: "a1",
      deciderId: "member-1",
      approve: true,
    });
    expect(result).toMatchObject({ ok: false, reason: "forbidden" });
  });
});
