import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = { middleware: () => chain, validator: () => chain, handler: (...args: unknown[]) => args.at(-1) };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const mock = vi.hoisted(() => ({ audit: vi.fn(), quality: vi.fn(), snapshot: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => ({ insert: mock.audit }) } }));
vi.mock("@/lib/builder/quality.server", () => ({ auditWorkspaceWebsite: mock.quality }));
vi.mock("@/lib/site-restore.functions", () => ({ readWebsiteState: mock.snapshot }));

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
const V_OLD = "44444444-4444-4444-8444-444444444441";
const V_CUR = "44444444-4444-4444-8444-444444444442";
const V_DRAFT = "44444444-4444-4444-8444-444444444443";
const V_FOREIGN = "44444444-4444-4444-8444-444444444444";
type Row = Record<string, unknown>;
type Write = { table: string; kind: string; row: Row };

const livePages = (heading: string) => ({
  live_format: 1,
  settings_pages: { home: { h: heading } },
  pages: [{ id: "home", sections: [{ id: "s1", kind: "hero", heading }] }],
});

function fixture(options: { role?: string; unpaid?: boolean; unapproved?: boolean; branch?: boolean } = {}) {
  const writes: Write[] = [];
  const chromeNode = { root: { id: "root", type: "text", text: "Fixture" } };
  const tables: Record<string, Row[]> = {
    memberships: [{ organization_id: ORG, user_id: USER, role: options.role ?? "owner" }],
    organizations: [{ id: ORG, name: "Fixture", is_demo: false, is_suspended: false, setup_payment_status: options.unpaid ? "unpaid" : "paid", trial_ends_at: "2026-10-01T00:00:00Z", subscription_status: "canceled" }],
    business_profiles: [{ organization_id: ORG, email: "fixture@example.test", city: "Fixture City" }],
    website_settings: [{ organization_id: ORG, generated_at: "2026-10-20T00:00:00Z", review_state: options.unapproved ? "pending" : "approved", seo: { headline: "Draft", meta_description: "Draft" }, generation: { firstBuildCreative: {}, report: { imagery: { generatedStatus: "owner_photos" } }, chrome: { header: chromeNode, footer: chromeNode } } }],
    website_pages: [{ organization_id: ORG, id: "home", slug: "home", is_visible: true }],
    website_sections: ["hero", "services", "contact"].map((kind) => ({ organization_id: ORG, id: kind, kind, is_visible: true })),
    services: [{ organization_id: ORG, id: "service", is_active: true }],
    website_branches: options.branch ? [{ organization_id: ORG, status: "open", label: "Pending changes" }] : [],
    website_versions: [
      { id: V_CUR, organization_id: ORG, version: 3, published_at: "2026-10-30T00:00:00Z", generation: { g: "cur" }, seo: { s: "cur" }, pages: livePages("Current") },
      { id: V_OLD, organization_id: ORG, version: 2, published_at: "2026-10-20T00:00:00Z", generation: { g: "old" }, seo: { s: "old" }, pages: livePages("Old working site") },
      { id: V_DRAFT, organization_id: ORG, version: 1, published_at: null, generation: {}, seo: {}, pages: { format: 1, pages: [] } },
      { id: V_FOREIGN, organization_id: OTHER, version: 9, published_at: "2026-10-20T00:00:00Z", generation: {}, seo: {}, pages: livePages("Other business") },
    ],
  };
  const client = { from(table: string) {
    const filters: [string, unknown][] = [];
    let pending: Row | null = null;
    const rows = () => (tables[table] ?? []).filter((row) => filters.every(([key, value]) => row[key] === value));
    const chain = {
      select: () => chain,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
      order: () => chain, limit: () => chain,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      insert: async (row: Row) => { writes.push({ table, kind: "insert", row }); return { error: null }; },
      update: (row: Row) => { pending = row; writes.push({ table, kind: "update", row }); return chain; },
      then: (resolve: (value: unknown) => unknown) => {
        if (pending) for (const row of rows()) Object.assign(row, pending);
        return resolve({ data: rows(), error: null });
      },
    };
    return chain;
  } };
  return { client, writes, tables };
}

async function restore(db: ReturnType<typeof fixture>, versionId: string) {
  const path = "./site-versions.functions.ts?server-fn-module-lookup";
  const module = await import(/* @vite-ignore */ path);
  const handler = module["restoreSiteVersion"] as (input: unknown) => Promise<{ activated: boolean; reason: string; version: number | null }>;
  return handler({ data: { organizationId: ORG, versionId }, context: { supabase: db.client, userId: USER } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.audit.mockResolvedValue({ error: null });
  mock.quality.mockResolvedValue({ ready: true, measured: true, productionReady: true, score: 95, blockers: [], issues: [] });
  mock.snapshot.mockResolvedValue({ pages: [] });
});

describe("restoreSiteVersion (republish an earlier live version)", () => {
  it("saves the old snapshot as a NEW live version and marks the site live, without approving the draft", async () => {
    const db = fixture();
    const result = await restore(db, V_OLD);
    expect(result).toMatchObject({ activated: true, version: 4 });
    const insert = db.writes.find((w) => w.table === "website_versions");
    expect(insert?.row).toMatchObject({
      organization_id: ORG,
      version: 4,
      label: "Production v4 (restored from v2)",
      generation: { g: "old" },
      seo: { s: "old" },
      pages: { live_format: 1, restored_from: 2, settings_pages: { home: { h: "Old working site" } } },
    });
    expect(insert?.row["published_at"]).toBeTruthy();
    const update = db.writes.find((w) => w.table === "website_settings");
    expect(update?.row).toMatchObject({ publish_state: "published", published: true });
    expect(update?.row).not.toHaveProperty("review_state");
    // Old versions are never deleted or overwritten by a restore.
    expect(db.tables["website_versions"]?.filter((r) => r["organization_id"] === ORG)).toHaveLength(3);
    expect(mock.audit.mock.calls.some(([r]) => r.action === "SITE_VERSION_RESTORED" && r.metadata.restored_from === 2)).toBe(true);
  });

  it("works even when the draft is unapproved or a draft branch is open (the draft is untouched)", async () => {
    const db = fixture({ unapproved: true, branch: true });
    expect(await restore(db, V_OLD)).toMatchObject({ activated: true, version: 4 });
    expect(db.writes.map((w) => w.table).sort()).toEqual(["website_settings", "website_versions"]);
  });

  it("keeps the payment gate and the role gate", async () => {
    const unpaid = fixture({ unpaid: true });
    expect((await restore(unpaid, V_OLD)).activated).toBe(false);
    expect(unpaid.writes).toEqual([]);
    const viewer = fixture({ role: "viewer" });
    await expect(restore(viewer, V_OLD)).rejects.toThrow("Only an owner");
    expect(viewer.writes).toEqual([]);
  });

  it("refuses unpublished versions and other businesses' versions without writing", async () => {
    for (const id of [V_DRAFT, V_FOREIGN]) {
      const db = fixture();
      await expect(restore(db, id)).rejects.toThrow("can't be restored");
      expect(db.writes).toEqual([]);
    }
  });
});
