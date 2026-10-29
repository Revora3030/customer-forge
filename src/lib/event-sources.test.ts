import { describe, expect, it } from "vitest";
import { buildFailedSource, ciFailedSource, leadUnansweredSource, routineFailedSource, trialExpiringSource } from "@/lib/event-sources.server";
import { PLATFORM_OWNER_ORG_ID } from "@/lib/platform-owner";

const NOW = Date.parse("2026-10-27T18:00:00Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const MIN = 60_000;
const HOUR = 3_600_000;

/** Chainable fake that really applies the filters the sources use, so tenant and time scoping are exercised. */
function fakeDb(tables: Record<string, Record<string, unknown>[]>, failTable?: string) {
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
      is: (c: string, v: unknown) => { rows = rows.filter((r) => (r[c] ?? null) === v); return q; },
      in: (c: string, v: unknown[]) => { rows = rows.filter((r) => v.includes(r[c])); return q; },
      gt: (c: string, v: string) => { rows = rows.filter((r) => String(r[c]) > v); return q; },
      gte: (c: string, v: string) => { rows = rows.filter((r) => String(r[c]) >= v); return q; },
      lte: (c: string, v: string) => { rows = rows.filter((r) => String(r[c]) <= v); return q; },
      order: () => q,
      limit: () => Promise.resolve(table === failTable ? { data: null, error: { message: "denied" } } : { data: rows, error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
    };
    return q;
  };
  return { from } as never;
}

describe("buildFailedSource", () => {
  const tables = () => ({
    generation_jobs: [
      { id: "j1", organization_id: "o1", status: "failed", updated_at: iso(HOUR), failed_stage: "layout", failure_kind: "ai_capacity" },
      { id: "j2", organization_id: "o1", status: "failed", updated_at: iso(2 * 24 * HOUR), failed_stage: "copy", failure_kind: null },
      { id: "j3", organization_id: "o2", status: "completed", updated_at: iso(HOUR), failed_stage: null, failure_kind: null },
      { id: "j4", organization_id: "o2", status: "failed", updated_at: iso(HOUR), failed_stage: "not-a-step", failure_kind: null },
    ],
    organizations: [{ id: "o1", name: "Acme Plumbing" }, { id: "o2", name: "Blue Door" }],
  });

  it("turns recent failures into events that name the stopped step and the failure kind", async () => {
    const events = await buildFailedSource(fakeDb(tables())).read(NOW);
    expect(events.map((e) => e.id).sort()).toEqual(["j1", "j4"]);
    const j1 = events.find((e) => e.id === "j1")!;
    expect(j1).toMatchObject({ type: "build.failed", subject: "Acme Plumbing" });
    expect(j1.detail).toContain('"Section layouts composed" (step 11 of 14)');
    expect(j1.detail).toContain("ai_capacity");
  });

  it("says nothing about a step it does not recognise, and throws when the read fails", async () => {
    const events = await buildFailedSource(fakeDb(tables())).read(NOW);
    expect(events.find((e) => e.id === "j4")!.detail).toBe("");
    await expect(buildFailedSource(fakeDb(tables(), "generation_jobs")).read(NOW)).rejects.toThrow("generation_jobs");
  });
});

describe("routineFailedSource", () => {
  const tables = () => ({
    jarvis_routines: [
      { id: "r1", name: "Daily Executive Brief", enabled: true, last_status: "error", last_summary: "Interrupted: the server stopped before this finished.", updated_at: iso(HOUR) },
      { id: "r2", name: "Site Health & Uptime Sentinel", enabled: true, last_status: "ok", last_summary: "Fine.", updated_at: iso(HOUR) },
      { id: "r3", name: "Old failure", enabled: true, last_status: "error", last_summary: "x", updated_at: iso(3 * 24 * HOUR) },
      { id: "r4", name: "Switched off", enabled: false, last_status: "error", last_summary: "x", updated_at: iso(HOUR) },
    ],
  });

  it("reports only enabled routines that failed in the last day, with what the routine said", async () => {
    const events = await routineFailedSource(fakeDb(tables())).read(NOW);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "routine.failed", subject: "Daily Executive Brief", detail: "Interrupted: the server stopped before this finished." });
  });

  it("throws when the read fails, so the bus reports the source as unreadable", async () => {
    await expect(routineFailedSource(fakeDb(tables(), "jarvis_routines")).read(NOW)).rejects.toThrow("jarvis_routines");
  });
});

describe("ciFailedSource", () => {
  const HEAD = "a".repeat(40);
  const OLD = "b".repeat(40);
  const run = (over: Record<string, unknown>) => ({ id: 1, name: "Revora Quality Gate", conclusion: "failure", head_sha: HEAD, updated_at: iso(10 * MIN), html_url: "https://github.com/Revora3030/customer-forge/actions/runs/1", ...over });
  const fetcherFor = (runs: unknown[], headStatus = 200, runsStatus = 200, sha: string = HEAD): typeof fetch =>
    (async (url: string) => {
      const u = String(url);
      if (u.includes("/commits/")) return { ok: headStatus < 400, status: headStatus, json: async () => ({ sha }) } as Response;
      return { ok: runsStatus < 400, status: runsStatus, json: async () => ({ workflow_runs: runs }) } as Response;
    }) as never;

  it("reports only failures on the release branch's current commit from the last day", async () => {
    const events = await ciFailedSource(fetcherFor([run({}), run({ id: 2, conclusion: "success" }), run({ id: 3, head_sha: OLD }), run({ id: 4, updated_at: iso(3 * 24 * HOUR) }), run({ id: 5, conclusion: "cancelled" })]), null).read(NOW);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ id: "1", type: "ci.failed", subject: "Revora Quality Gate" });
    expect(events[0]!.detail).toContain("aaaaaaa");
    expect(events[0]!.detail).toContain("https://github.com/Revora3030/customer-forge/actions/runs/1");
  });

  it("leaves out a link that does not point at this repository's runs", async () => {
    const events = await ciFailedSource(fetcherFor([run({ html_url: "https://evil.example/phish" })]), null).read(NOW);
    expect(events[0]!.detail).not.toContain("evil.example");
  });

  it("throws, rather than reporting calm, when GitHub refuses or the commit cannot be read", async () => {
    await expect(ciFailedSource(fetcherFor([], 200, 403), null).read(NOW)).rejects.toThrow("403");
    await expect(ciFailedSource(fetcherFor([], 404, 200), null).read(NOW)).rejects.toThrow("404");
    await expect(ciFailedSource(fetcherFor([], 200, 200, "nonsense"), null).read(NOW)).rejects.toThrow("no release commit");
  });
});

describe("leadUnansweredSource", () => {
  const tables = () => ({
    leads: [
      { id: "l1", organization_id: PLATFORM_OWNER_ORG_ID, name: "Dana", created_at: iso(2 * HOUR) },
      { id: "l2", organization_id: PLATFORM_OWNER_ORG_ID, name: "Eli", created_at: iso(3 * HOUR) },
      { id: "l3", organization_id: PLATFORM_OWNER_ORG_ID, name: "Fay", created_at: iso(2 * MIN) },
      { id: "l4", organization_id: "other-tenant", name: "Gus", created_at: iso(5 * HOUR) },
    ],
    lead_activities: [
      { lead_id: "l2", organization_id: PLATFORM_OWNER_ORG_ID, kind: "call", created_at: iso(3 * HOUR - 2 * MIN) },
      { lead_id: "l4", organization_id: "other-tenant", kind: "call", created_at: iso(HOUR) },
    ],
  });

  it("flags only Revora's own leads that are past the goal with no logged reply", async () => {
    const events = await leadUnansweredSource(fakeDb(tables())).read(NOW);
    expect(events.map((e) => e.subject)).toEqual(["Dana"]);
    expect(events[0]).toMatchObject({ id: "l1", type: "lead.unanswered", detail: "Waiting 2 h." });
  });

  it("throws when either read fails", async () => {
    await expect(leadUnansweredSource(fakeDb(tables(), "leads")).read(NOW)).rejects.toThrow("leads");
  });
});

describe("trialExpiringSource", () => {
  const tables = () => ({
    platform_trials: [
      { id: "t1", organization_id: "o1", trial_ends_at: new Date(NOW + 6 * HOUR).toISOString(), converted_at: null },
      { id: "t2", organization_id: "o2", trial_ends_at: new Date(NOW + 6 * HOUR).toISOString(), converted_at: null },
      { id: "t3", organization_id: "o3", trial_ends_at: new Date(NOW + 6 * HOUR).toISOString(), converted_at: iso(HOUR) },
      { id: "t4", organization_id: "o4", trial_ends_at: new Date(NOW - HOUR).toISOString(), converted_at: null },
      { id: "t5", organization_id: "o5", trial_ends_at: new Date(NOW + 3 * 24 * HOUR).toISOString(), converted_at: null },
      { id: "t6", organization_id: PLATFORM_OWNER_ORG_ID, trial_ends_at: new Date(NOW + 6 * HOUR).toISOString(), converted_at: null },
    ],
    organizations: [{ id: "o1", name: "Blue Door Salon" }, { id: "o2", name: "Already Paying Co" }],
    subscriptions: [{ organization_id: "o2", status: "active" }],
  });

  it("reports unconverted trials ending within a day, but not paying, already-ended, far-off or internal ones", async () => {
    const events = await trialExpiringSource(fakeDb(tables())).read(NOW);
    expect(events.map((e) => e.id)).toEqual(["t1"]);
    expect(events[0]).toMatchObject({ type: "client.trial_expiring", subject: "Blue Door Salon" });
    expect(events[0]!.detail).toContain("UTC");
  });

  it("throws when the trials cannot be read", async () => {
    await expect(trialExpiringSource(fakeDb(tables(), "platform_trials")).read(NOW)).rejects.toThrow("platform_trials");
  });
});
