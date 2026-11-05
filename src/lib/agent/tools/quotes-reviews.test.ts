import { describe, expect, it } from "vitest";
import type { LimitsDeps } from "@/lib/agent/limits.server";
import { createDefaultToolRegistryV2, type ToolContextV2 } from "@/lib/ai/tool-registry-v2.server";
import { readToolsC, SUMMARY_ROW_CAP } from "./quotes-reviews";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const NAMES = ["quotes.summary", "reviews.summary"];

type Row = Record<string, unknown>;
function ctx(tables: Record<string, Row[]>, seen: string[][] = []): ToolContextV2 {
  return {
    supabase: {
      from(table: string) {
        const ops: string[] = [table];
        seen.push(ops);
        let org: unknown;
        let since: unknown;
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: (k: string, v: unknown) => (
            k === "organization_id" && (org = v),
            ops.push(`eq:${k}`),
            chain
          ),
          gte: (k: string, v: unknown) => (ops.push(`gte:${k}`), (since = v), chain),
          limit: () => chain,
          then: (res: (v: unknown) => unknown) =>
            Promise.resolve({
              data: (tables[table] ?? []).filter(
                (r) => r["organization_id"] === org && String(r["created_at"]) >= String(since),
              ),
              error: null,
            }).then(res),
        };
        return chain;
      },
    },
    userId: "u",
    organizationId: ORG,
    isSuperAdmin: false,
    runId: "33333333-3333-4333-8333-333333333333",
    stepId: "44444444-4444-4444-8444-444444444444",
  } as unknown as ToolContextV2;
}
const recent = new Date(Date.now() - 86_400_000).toISOString();
const old = new Date(Date.now() - 200 * 86_400_000).toISOString();
const find = (name: string) => readToolsC().find((t) => t.name === name)!;
const run = (name: string, c: ToolContextV2, input: unknown = {}) =>
  find(name).run(find(name).schema.parse(input) as never, c) as Promise<Record<string, unknown>>;

describe("COMP-14 summaries", () => {
  it("are read-only, owner scope, and don't clash with the PAI-7 names", () => {
    const tools = readToolsC();
    expect(tools.map((t) => t.name)).toEqual(NAMES);
    for (const t of tools) {
      expect(t.risk).toBe("read");
      expect(t.scope).toBe("owner");
      expect(t.schema.safeParse({ organizationId: OTHER }).success).toBe(false);
    }
  });

  it("counts quotes by status in the window, this workspace only", async () => {
    const tables = {
      quotes: [
        { organization_id: ORG, status: "accepted", created_at: recent, customer_name: "Ada" },
        { organization_id: ORG, status: "sent", created_at: recent },
        { organization_id: ORG, status: "sent", created_at: recent },
        { organization_id: ORG, status: "accepted", created_at: old },
        { organization_id: OTHER, status: "accepted", created_at: recent },
      ],
    };
    const out = await run("quotes.summary", ctx(tables));
    expect(out).toMatchObject({
      days: 90,
      total: 3,
      by_status: { accepted: 1, sent: 2 },
      accepted: 1,
      accepted_share: 33,
      partial: false,
    });
    expect(JSON.stringify(out)).not.toContain("Ada");
    expect((await run("quotes.summary", ctx(tables), { days: 365 }))["total"]).toBe(4);
  });

  it("an empty window gives zero and no invented rate", async () => {
    const out = await run("quotes.summary", ctx({}));
    expect(out).toMatchObject({ total: 0, accepted: 0, accepted_share: null });
    expect(await run("reviews.summary", ctx({}))).toMatchObject({
      total: 0,
      average_rating: null,
      low_ratings: 0,
    });
  });

  it("summarises reviews without names or text", async () => {
    const out = await run(
      "reviews.summary",
      ctx({
        reviews: [
          {
            organization_id: ORG,
            rating: 5,
            is_published: true,
            created_at: recent,
            comment: "secret text",
            author_name: "Sam",
          },
          { organization_id: ORG, rating: 4, is_published: true, created_at: recent },
          { organization_id: ORG, rating: 2, is_published: false, created_at: recent },
          { organization_id: OTHER, rating: 1, is_published: true, created_at: recent },
        ],
      }),
    );
    expect(out).toMatchObject({
      total: 3,
      average_rating: 3.7,
      published: 2,
      low_ratings: 1,
      stars: { "5": 1, "4": 1, "2": 1, "1": 0 },
    });
    expect(JSON.stringify(out)).not.toMatch(/secret|Sam/);
  });

  it("says when it hit the row cap", async () => {
    const rows = Array.from({ length: SUMMARY_ROW_CAP }, () => ({
      organization_id: ORG,
      status: "sent",
      created_at: recent,
    }));
    expect((await run("quotes.summary", ctx({ quotes: rows })))["partial"]).toBe(true);
  });

  it("scopes by organization_id and window on every read", async () => {
    const seen: string[][] = [];
    await run("reviews.summary", ctx({}, seen));
    expect(seen[0]).toEqual(["reviews", "eq:organization_id", "gte:created_at"]);
  });
});

function limits(over: { enabled?: boolean; env?: Record<string, string> } = {}): LimitsDeps {
  return {
    env: over.env ?? {},
    store: {
      getSettings: async () => ({ enabled: over.enabled ?? true, reason: null }),
      getOverrides: async () => ({}),
      listDisabledOrganizations: async () => [],
    },
    ledger: {
      admit: async () => ({ admitted: true, reason: "ok", inFlight: 0, runsLastHour: 0 }),
      markStarted: async () => true,
      markFinished: async () => true,
      cancelQueued: async () => [],
    },
    toolCalls: { countSince: async () => 0 },
  } as LimitsDeps;
}
const call = (name: string) => ({ name, arguments: {}, requestId: "r1" }) as never;

describe("COMP-14 goes through PAI-5 limits and kill switches", () => {
  it("is in the default registry", () => {
    const registry = createDefaultToolRegistryV2({
      audit: async () => undefined,
      limits: limits(),
    });
    for (const name of NAMES) expect(registry.find(name)).not.toBeNull();
  });
  for (const [label, deps] of [
    ["workspace switched off", limits({ enabled: false })],
    ["global kill switch", limits({ env: { AGENT_RUNS_DISABLED: "1" } })],
  ] as const) {
    it(`refuses both when ${label}, without reading data`, async () => {
      const registry = createDefaultToolRegistryV2({ audit: async () => undefined, limits: deps });
      const c = ctx({});
      (c.supabase as unknown as { from: () => never }).from = () => {
        throw new Error("tool body must not run");
      };
      for (const name of NAMES) {
        const result = await registry.run(c, call(name));
        expect(result.ok).toBe(false);
        expect(result.ok ? "" : result.error).not.toContain("tool body must not run");
      }
    });
  }
  it("lets a call through when allowed", async () => {
    const registry = createDefaultToolRegistryV2({
      audit: async () => undefined,
      limits: limits(),
    });
    const result = await registry.run(ctx({}), call("quotes.summary"));
    expect(result.ok).toBe(true);
  });
});
