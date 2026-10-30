import { beforeEach, describe, expect, it, vi } from "vitest";

const processDueRuns = vi.fn();
vi.mock("@/lib/automation-engine", () => ({ processDueRuns: (...args: unknown[]) => processDueRuns(...args) }));

type Row = Record<string, unknown>;
function fakeAdmin(tables: { automation_runs: Row[]; organizations: Row[]; business_profiles: Row[] }) {
  const filters: [string, string, unknown][] = [];
  const from = (table: keyof typeof tables) => {
    let rows = [...tables[table]];
    const chain = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        filters.push([table, `eq:${col}`, val]);
        rows = rows.filter((r) => r[col] === val);
        return chain;
      },
      lte: (col: string, val: string) => {
        filters.push([table, `lte:${col}`, val]);
        rows = rows.filter((r) => String(r[col]) <= val);
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      in: (col: string, vals: unknown[]) => {
        rows = rows.filter((r) => vals.includes(r[col]));
        return chain;
      },
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
    };
    return chain;
  };
  return { client: { from } as never, filters };
}

const NOW = new Date("2026-10-30T12:00:00Z");

describe("scheduled automation sweep", () => {
  beforeEach(() => {
    processDueRuns.mockReset();
    processDueRuns.mockResolvedValue({ sent: 1, skipped: 0, failed: 0 });
  });

  it("delivers due follow-ups for every workspace that has them, with that business's reply-to", async () => {
    const { runDueAutomationSweep } = await import("./automation-sweep.server");
    const { client, filters } = fakeAdmin({
      automation_runs: [
        { organization_id: "org-a", status: "queued", scheduled_for: "2026-10-30T11:00:00Z" },
        { organization_id: "org-a", status: "queued", scheduled_for: "2026-10-30T11:30:00Z" },
        { organization_id: "org-b", status: "queued", scheduled_for: "2026-10-29T09:00:00Z" },
        { organization_id: "org-c", status: "queued", scheduled_for: "2026-11-02T09:00:00Z" },
        { organization_id: "org-d", status: "sent", scheduled_for: "2026-10-29T09:00:00Z" },
      ],
      organizations: [
        { id: "org-a", name: "Alpha Plumbing", is_suspended: false },
        { id: "org-b", name: "Bravo Roofing", is_suspended: false },
      ],
      business_profiles: [{ organization_id: "org-a", email: "office@alpha.example", owner_email: null, state: "TX" }],
    });
    const deliverFor = vi.fn((ctx: unknown) => {
      const fn = vi.fn();
      (fn as unknown as { ctx: unknown }).ctx = ctx;
      return fn;
    });

    const result = await runDueAutomationSweep(client, { deliverFor, now: () => NOW });

    expect(filters).toContainEqual(["automation_runs", "eq:status", "queued"]);
    expect(filters).toContainEqual(["automation_runs", "lte:scheduled_for", NOW.toISOString()]);
    expect(processDueRuns.mock.calls.map((c) => c[1]).sort()).toEqual(["org-a", "org-b"]);
    expect(deliverFor).toHaveBeenCalledWith({ businessName: "Alpha Plumbing", replyTo: "office@alpha.example", businessState: "TX" });
    expect(deliverFor).toHaveBeenCalledWith({ businessName: "Bravo Roofing", replyTo: null, businessState: null });
    expect(result).toEqual({ workspaces: 2, sent: 2, skipped: 0, failed: 0, errors: 0, more: false });
  });

  it("skips suspended workspaces and keeps going when one workspace fails", async () => {
    const { runDueAutomationSweep } = await import("./automation-sweep.server");
    const { client } = fakeAdmin({
      automation_runs: ["org-a", "org-b", "org-c"].map((id) => ({ organization_id: id, status: "queued", scheduled_for: "2026-10-30T00:00:00Z" })),
      organizations: [
        { id: "org-a", name: "A", is_suspended: true },
        { id: "org-b", name: "B", is_suspended: false },
        { id: "org-c", name: "C", is_suspended: false },
      ],
      business_profiles: [],
    });
    processDueRuns.mockImplementation(async (_c: unknown, orgId: string) => {
      if (orgId === "org-b") throw new Error("boom");
      return { sent: 2, skipped: 1, failed: 0 };
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runDueAutomationSweep(client, { deliverFor: () => vi.fn(), now: () => NOW });

    expect(processDueRuns.mock.calls.map((c) => c[1])).not.toContain("org-a");
    expect(result).toMatchObject({ workspaces: 1, sent: 2, skipped: 1, errors: 1 });
  });

  it("does nothing when nothing is due", async () => {
    const { runDueAutomationSweep } = await import("./automation-sweep.server");
    const { client } = fakeAdmin({ automation_runs: [], organizations: [], business_profiles: [] });
    const result = await runDueAutomationSweep(client, { deliverFor: () => vi.fn(), now: () => NOW });
    expect(processDueRuns).not.toHaveBeenCalled();
    expect(result.workspaces).toBe(0);
  });

  it("caps one pass and reports that more workspaces are waiting", async () => {
    const { runDueAutomationSweep, SWEEP_WORKSPACES_PER_PASS } = await import("./automation-sweep.server");
    const ids = Array.from({ length: SWEEP_WORKSPACES_PER_PASS + 5 }, (_, i) => `org-${i}`);
    const { client } = fakeAdmin({
      automation_runs: ids.map((id) => ({ organization_id: id, status: "queued", scheduled_for: "2026-10-30T00:00:00Z" })),
      organizations: ids.map((id) => ({ id, name: id, is_suspended: false })),
      business_profiles: [],
    });
    const result = await runDueAutomationSweep(client, { deliverFor: () => vi.fn(), now: () => NOW });
    expect(processDueRuns).toHaveBeenCalledTimes(SWEEP_WORKSPACES_PER_PASS);
    expect(result.more).toBe(true);
  });
});

describe("automation-runs job route", () => {
  it("refuses GET and requires the cron secret", async () => {
    vi.resetModules();
    vi.doMock("@/integrations/supabase/cron-auth", () => ({
      authenticateCronRequest: async () => new Response("Unauthorized", { status: 401 }),
    }));
    const { Route } = await import("@/routes/api/public/jobs/automation-runs");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handlers = (Route.options as any).server.handlers;
    const url = ["https:", "", "example.test", "api", "public", "jobs", "automation-runs"].join("/");
    expect((await handlers.GET()).status).toBe(405);
    expect((await handlers.POST({ request: new Request(url, { method: "POST" }) })).status).toBe(401);
    vi.doUnmock("@/integrations/supabase/cron-auth");
  });
});

describe("customer jobs schedule migration", () => {
  it("schedules the follow-up sweep and the retry, health and backup jobs through call_revora_job", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync("supabase/migrations/20261030120000_customer_jobs_schedule.sql", "utf8");
    for (const job of ["automation-runs", "lead-alert-retry", "site-health", "backup"]) {
      expect(sql).toContain(`call_revora_job('${job}', 900000)`);
    }
    expect(sql).toContain("'revora-automation-runs',\n    '*/10 * * * *'");
    expect(sql).toMatch(/extname = 'pg_cron'/);
  });
});
