import { describe, expect, it } from "vitest";
import { aggregateEngineFunnel, funnelStates, type EngineFunnelInputs, type FunnelDemo } from "@/lib/engine-funnel";
import { JARVIS_ACTION_CLASSES, actionCatalogPrompt, describeRead, parseActions } from "@/lib/jarvis-actions";

const NOW = new Date("2026-10-20T15:00:00.000Z");
const TODAY = "2026-10-20T09:00:00.000Z";
const EARLIER = "2026-10-12T09:00:00.000Z";

const demo = (organizationId: string, state: string | null, overrides: Partial<FunnelDemo> = {}): FunnelDemo => ({
  organizationId,
  state,
  createdAt: EARLIER,
  enrichedAt: null,
  claimedAt: null,
  ...overrides,
});

const inputs = (overrides: Partial<EngineFunnelInputs> = {}): EngineFunnelInputs => ({
  demos: [
    demo("a", "NC", { createdAt: TODAY, enrichedAt: TODAY }),
    demo("b", "NC", { enrichedAt: EARLIER, claimedAt: TODAY }),
    demo("c", "TX"),
    demo("d", null),
  ],
  rotation: [
    { state: "NC", lastSearchedAt: TODAY, lastFound: 5, lastBuilt: 1 },
    { state: "TX", lastSearchedAt: EARLIER, lastFound: 2, lastBuilt: 2 },
  ],
  builds: [{ organizationId: "a", at: TODAY }, { organizationId: "b", at: EARLIER }, { organizationId: "c", at: EARLIER }],
  deliveries: [
    { organizationId: "a", at: TODAY },
    { organizationId: "b", at: EARLIER },
    // A second send to the same business counts once, at its first time.
    { organizationId: "b", at: TODAY },
    // Not a prospect demo: not engine output.
    { organizationId: "stranger", at: TODAY },
  ],
  views: [{ organizationId: "b", at: EARLIER }, { organizationId: "b", at: TODAY }, { organizationId: "a", at: TODAY }],
  conversions: [{ organizationId: "b", at: TODAY }],
  ...overrides,
});

const stage = (funnel: ReturnType<typeof aggregateEngineFunnel>, key: string) => funnel.stages.find((entry) => entry.key === key)!;

describe("engine funnel aggregation", () => {
  it("counts each business once per stage, in total and today, by state", () => {
    const funnel = aggregateEngineFunnel(inputs(), NOW);
    expect(funnel.day).toBe("2026-10-20");
    expect(funnel.unavailable).toEqual([]);
    expect(funnel.stages.map((entry) => [entry.key, entry.total, entry.today])).toEqual([
      // 4 demos + 4 unbuilt rotation finds in NC (today); TX's finds were all built.
      ["discovered", 8, 5],
      ["enriched", 2, 1],
      ["built", 3, 1],
      ["delivered", 2, 1],
      ["viewed", 2, 1],
      ["claimed", 1, 1],
      ["converted", 1, 1],
    ]);
    expect(stage(funnel, "discovered").byState).toEqual({ NC: { total: 6, today: 5 }, TX: { total: 1, today: 0 }, unknown: { total: 1, today: 0 } });
    expect(stage(funnel, "delivered").byState).toEqual({ NC: { total: 2, today: 1 } });
    expect(funnelStates(funnel)).toEqual(["NC", "TX", "unknown"]);
  });

  it("reports an unreadable source as unknown, never zero", () => {
    const funnel = aggregateEngineFunnel(inputs({ rotation: null, views: null, conversions: null }), NOW);
    expect(funnel.unavailable).toEqual(["viewed", "converted"]);
    expect(stage(funnel, "viewed")).toMatchObject({ total: null, today: null, byState: {} });
    // Without the rotation cursor, discovered is the provisioned demos alone.
    expect(stage(funnel, "discovered")).toMatchObject({ total: 4, today: 1 });

    const nothing = aggregateEngineFunnel(inputs({ demos: null }), NOW);
    expect(nothing.unavailable).toEqual(["discovered", "enriched", "built", "delivered", "viewed", "claimed", "converted"]);
  });

  it("is all zeros, not unknown, when the engine has made nothing yet", () => {
    const funnel = aggregateEngineFunnel({ demos: [], rotation: [], builds: [], deliveries: [], views: [], conversions: [] }, NOW);
    expect(funnel.unavailable).toEqual([]);
    expect(funnel.stages.every((entry) => entry.total === 0 && entry.today === 0)).toBe(true);
  });
});

describe("engine funnel reads", () => {
  it("tolerates tables that don't exist yet and reads paid the way billing marks it", async () => {
    const { getEngineFunnel } = await import("@/lib/engine-funnel.server");
    type Row = Record<string, unknown>;
    const tables: Record<string, Row[] | "missing"> = {
      website_settings: [
        { organization_id: "o1", generation: { prospectDemo: { kind: "prospect_demo", createdAt: TODAY, claimedAt: TODAY, enrichment: { status: "verified", email: "a@b.co", reason: "ok", checkedAt: TODAY } } } },
        { organization_id: "o2", generation: { prospectDemo: { kind: "prospect_demo", createdAt: EARLIER } } },
        { organization_id: "o3", generation: { somethingElse: true } },
      ],
      business_profiles: [{ organization_id: "o1", state: "North Carolina" }],
      generation_jobs: [
        { organization_id: "o1", status: "completed", completed_at: TODAY, created_at: TODAY },
        { organization_id: "o2", status: "failed", completed_at: null, created_at: TODAY },
        { organization_id: "o2", status: "completed", completed_at: EARLIER, created_at: EARLIER },
      ],
      prospect_outreach: [{ organization_id: "o1", kind: "first_touch", created_at: TODAY }, { organization_id: "o2", kind: "followup", created_at: TODAY }],
      organizations: [{ id: "o1", subscription_status: "trialing", setup_paid_at: TODAY, setup_payment_status: "paid" }, { id: "o2", subscription_status: "trialing", setup_paid_at: null }],
      prospect_rotation_cursor: "missing",
      prospect_preview_events: "missing",
    };
    const db = {
      from(name: string) {
        const data = tables[name];
        const result = data === "missing" || data === undefined ? { data: null, error: { message: `relation "${name}" does not exist` } } : { data, error: null };
        const chain: Record<string, unknown> = {};
        for (const method of ["select", "not", "in", "eq", "order", "limit"]) chain[method] = () => chain;
        chain["then"] = (resolve: (value: unknown) => unknown) => resolve(result);
        return chain;
      },
    };
    const funnel = await getEngineFunnel(db as never, { now: NOW });
    expect(funnel.unavailable).toEqual(["viewed"]);
    expect(funnel.stages.map((entry) => [entry.key, entry.total, entry.today])).toEqual([
      ["discovered", 2, 1],
      ["enriched", 1, 1],
      // o2's latest build failed, so only o1 counts as built.
      ["built", 1, 1],
      // The follow-up is not a delivery.
      ["delivered", 1, 1],
      ["viewed", null, null],
      ["claimed", 1, 1],
      ["converted", 1, 1],
    ]);
    expect(funnel.stages[0]!.byState).toEqual({ NC: { total: 1, today: 1 }, unknown: { total: 1, today: 0 } });
  });
});

describe("engine.today Jarvis action", () => {
  it("parses as an auto-running read and is described in the catalog with the rotation setting", () => {
    const parsed = parseActions([{ id: "engine.today", args: {} }], []);
    expect(parsed).toEqual({ reads: [{ id: "engine.today" }], proposals: [], rejected: [] });
    expect(JARVIS_ACTION_CLASSES["engine.today"]).toEqual({ effect: "read", external: false, autoRuns: true });
    expect(describeRead({ id: "engine.today" })).toBe("Checked the prospect engine funnel");
    const prompt = actionCatalogPrompt([]);
    expect(prompt).toContain('{"id":"engine.today","args":{}}');
    expect(prompt).toMatch(/"rotation":\{"enabled":true/);
    expect(prompt).toMatch(/Suggest turning rotation on/);
    // The suggested rotation shape is one autopilot.configure accepts.
    expect(parseActions([{ id: "autopilot.configure", args: { rotation: { enabled: true, trades: ["HVAC"], states: ["NC"] } } }], []).proposals).toHaveLength(1);
  });
});
