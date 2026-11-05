import { describe, expect, it, vi } from "vitest";
import type { ApprovalDeps, ApprovalRepo, ApprovalRow } from "./approvals.server";
import {
  acceptSuggestion,
  detectSignals,
  dismissSuggestion,
  openDays,
  runSuggestionPass,
  startApprovedSuggestion,
  SUGGESTION_TOOL,
  type FiredSignal,
  type SignalSnapshot,
  type SuggestionRepo,
  type SuggestionRow,
} from "./suggestions.server";

const NOW = new Date("2026-11-05T12:00:00Z");
const ORG = "11111111-1111-1111-1111-111111111111";
const quiet: SignalSnapshot = {
  now: NOW,
  unansweredLeads: { count: 0, oldestAt: null, ids: [] },
  reviewAsksKnown: true,
  lastReviewAskAt: "2026-11-01T00:00:00Z",
  openDaysNext7: 5,
  bookingsNext7: 3,
  domain: { customDomain: "x.com", verified: true, status: "active" },
  views: { last7: 100, prior7: 100 },
  lastPublishedAt: "2026-10-30T00:00:00Z",
};
const loud: SignalSnapshot = {
  now: NOW,
  unansweredLeads: { count: 2, oldestAt: "2026-11-02T00:00:00Z", ids: ["a", "b"] },
  reviewAsksKnown: true,
  lastReviewAskAt: null,
  openDaysNext7: 5,
  bookingsNext7: 0,
  domain: { customDomain: "x.com", verified: false, status: "pending" },
  views: { last7: 10, prior7: 100 },
  lastPublishedAt: "2026-06-01T00:00:00Z",
};

function memRepo(snapshot: SignalSnapshot, rows: SuggestionRow[] = []) {
  let n = 0;
  const repo: SuggestionRepo & { rows: SuggestionRow[] } = {
    rows,
    collect: async () => snapshot,
    current: async (_o, now) =>
      rows.filter((r) => r.status === "active" || ((r.status === "dismissed" || r.status === "snoozed") && r.suppressed_until! > now.toISOString())),
    insert: async (org, f: FiredSignal) => {
      rows.push({ id: `s${++n}`, organization_id: org, signal: f.signal, title: f.title, body: f.body, evidence: f.evidence, action_goal: f.actionGoal, status: "active", approval_id: null, suppressed_until: null, created_at: NOW.toISOString() });
    },
    resolve: async (ids) => rows.forEach((r) => ids.includes(r.id) && (r.status = "resolved")),
    get: async (org, id) => rows.find((r) => r.id === id && r.organization_id === org) ?? null,
    update: async (id, patch) => {
      Object.assign(rows.find((r) => r.id === id)!, patch);
    },
  };
  return repo;
}

describe("detectSignals", () => {
  it("fires nothing on a healthy workspace", () => expect(detectSignals(quiet)).toEqual([]));
  it("fires every signal with evidence", () => {
    const f = detectSignals(loud);
    expect(f.map((x) => x.signal)).toEqual(["unanswered_leads", "no_review_asks", "empty_hours", "domain_unverified", "traffic_drop", "stale_site"]);
    for (const x of f) expect(Object.keys(x.evidence).length).toBeGreaterThan(0);
    expect(f[4]!.evidence).toMatchObject({ dropPercent: 90 });
  });
  it("never fires on unknown data", () => expect(detectSignals({ now: NOW })).toEqual([]));
  it("ignores small traffic baselines", () => expect(detectSignals({ now: NOW, views: { last7: 0, prior7: 10 } })).toEqual([]));
});

describe("runSuggestionPass", () => {
  it("makes zero model calls when no signal fires", async () => {
    const word = vi.fn();
    const r = await runSuggestionPass(memRepo(quiet), ORG, { now: NOW, word });
    expect(word).not.toHaveBeenCalled();
    expect(r).toMatchObject({ fired: 0, created: 0, modelCalls: 0 });
  });
  it("keeps at most 3 active and words them with one call", async () => {
    const repo = memRepo(loud);
    const word = vi.fn(async (f: FiredSignal[]) => f.map(() => ({ title: "Worded" })));
    const r = await runSuggestionPass(repo, ORG, { now: NOW, word });
    expect(r).toMatchObject({ fired: 6, created: 3, modelCalls: 1 });
    expect(repo.rows.filter((x) => x.status === "active")).toHaveLength(3);
    expect(repo.rows[0]!.title).toBe("Worded");
    const again = await runSuggestionPass(repo, ORG, { now: NOW, word });
    expect(again.created).toBe(0);
    expect(repo.rows.filter((x) => x.status === "active")).toHaveLength(3);
  });
  it("falls back to facts when wording fails", async () => {
    const repo = memRepo(loud);
    await runSuggestionPass(repo, ORG, { now: NOW, word: async () => { throw new Error("x"); } });
    expect(repo.rows[0]!.title).toMatch(/2 leads waiting/);
  });
  it("dismissed signals stay away for 14 days", async () => {
    const repo = memRepo({ now: NOW, domain: loud.domain ?? null });
    await runSuggestionPass(repo, ORG, { now: NOW });
    await dismissSuggestion(repo, ORG, "s1", NOW);
    const day13 = new Date(NOW.getTime() + 13 * 86_400_000);
    expect((await runSuggestionPass(repo, ORG, { now: day13 })).created).toBe(0);
    const day15 = new Date(NOW.getTime() + 15 * 86_400_000);
    expect((await runSuggestionPass(repo, ORG, { now: day15 })).created).toBe(1);
  });
  it("resolves suggestions whose signal stopped firing", async () => {
    const snap: SignalSnapshot = { now: NOW, domain: loud.domain ?? null };
    const repo = memRepo(snap);
    await runSuggestionPass(repo, ORG, { now: NOW });
    snap.domain = quiet.domain ?? null;
    expect((await runSuggestionPass(repo, ORG, { now: NOW })).resolved).toBe(1);
  });
});

describe("do it", () => {
  function approvals() {
    let row: ApprovalRow | null = null;
    const repo = {
      request: vi.fn(async (i) => {
        row = { id: "ap1", organization_id: i.organizationId, scope: "owner", tool: i.tool, args: i.args, args_hash: i.argsHash, summary: i.summary, status: "pending" } as unknown as ApprovalRow;
        return { approval: row, created: true };
      }),
      consume: vi.fn(async (i) =>
        row && row.status === "approved" && i.argsHash === row.args_hash && i.tool === row.tool
          ? { outcome: "consumed" as const, approval: row }
          : { outcome: "not_approved" as const, approval: null },
      ),
      decide: vi.fn(),
      cancelForRun: vi.fn(),
      sweep: vi.fn(),
    } as unknown as ApprovalRepo;
    return { deps: { repo } as ApprovalDeps, approve: () => row && (row.status = "approved") };
  }

  it("only asks the owner; the run starts after the tap is consumed", async () => {
    const repo = memRepo(loud);
    await runSuggestionPass(repo, ORG, { now: NOW });
    const a = approvals();
    const startRun = vi.fn(async () => ({ runId: "run1" }));
    const accepted = await acceptSuggestion(repo, a.deps, ORG, "s1", "user1");
    expect(accepted).toEqual({ ok: true, approvalId: "ap1" });
    expect(a.deps.repo.request).toHaveBeenCalledWith(expect.objectContaining({ tool: SUGGESTION_TOOL, scope: "owner" }));
    expect(startRun).not.toHaveBeenCalled();
    expect((await startApprovedSuggestion(repo, a.deps, ORG, "s1", startRun)).ok).toBe(false);
    expect(startRun).not.toHaveBeenCalled();
    a.approve();
    expect(await startApprovedSuggestion(repo, a.deps, ORG, "s1", startRun)).toEqual({ ok: true, runId: "run1" });
    expect(startRun).toHaveBeenCalledTimes(1);
  });
  it("refuses another workspace's suggestion", async () => {
    const repo = memRepo(loud);
    await runSuggestionPass(repo, ORG, { now: NOW });
    const r = await acceptSuggestion(repo, approvals().deps, "22222222-2222-2222-2222-222222222222", "s1", null);
    expect(r.ok).toBe(false);
  });
});

describe("openDays", () => {
  it("counts non-closed days and returns null for unreadable hours", () => {
    expect(openDays({ mon: { open: "09:00", close: "17:00" }, sun: { closed: true } }, NOW)).toBe(1);
    expect(openDays(null, NOW)).toBeNull();
    expect(openDays({ foo: 1 }, NOW)).toBeNull();
  });
});
