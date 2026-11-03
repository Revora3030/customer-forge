import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scoreVideoBar } from "@/lib/builder/quality/video-score";
import { badSite, blueprintFor, goodSite } from "@/lib/builder/quality/video-score.fixtures";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = { middleware: () => chain, validator: () => chain, handler: (...args: unknown[]) => args.at(-1) };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const mock = vi.hoisted(() => ({ qlog: vi.fn(), audit: vi.fn(), quality: vi.fn(), snapshot: vi.fn(), videoBar: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (table: string) => ({ insert: table === "builder_quality_log" ? mock.qlog : mock.audit }) } }));
vi.mock("@/lib/builder/quality.server", () => ({ auditWorkspaceWebsite: mock.quality }));
vi.mock("@/lib/site-restore.functions", () => ({ readWebsiteState: mock.snapshot }));
vi.mock("@/lib/builder/quality/video-publish-gate.server", () => ({ scoreWorkspaceVideoBar: mock.videoBar }));
const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
type Row = Record<string, unknown>;
type Write = { table: string; kind: string; row: Row; filters: [string, unknown][] };

function fixture(options: { role?: string | null; unpaid?: boolean; suspended?: boolean; branch?: boolean; snapshotError?: boolean; publishError?: boolean; unapproved?: boolean; admin?: boolean } = {}) {
  const writes: Write[] = [];
  const reads: { table: string; filters: [string, unknown][] }[] = [];
  const chrome = { root: { id: "root", type: "text", text: "Fixture" } };
  const tables: Record<string, Row[]> = {
    memberships: options.role === null ? [] : [{ organization_id: ORG, user_id: USER, role: options.role ?? "owner" }],
    organizations: [{ id: ORG, name: "Fixture", is_demo: false, is_suspended: !!options.suspended, setup_payment_status: options.unpaid ? "unpaid" : "paid", trial_ends_at: "2026-10-01T00:00:00Z", subscription_status: "canceled" }],
    business_profiles: [{ organization_id: ORG, email: "fixture@example.test", city: "Fixture City" }],
    website_settings: [{ organization_id: ORG, generated_at: "2026-10-20T00:00:00Z", review_state: options.unapproved ? "pending" : "approved", seo: { headline: "Fixture", meta_description: "Fixture description" }, generation: { firstBuildCreative: {}, report: { imagery: { generatedStatus: "owner_photos" } }, chrome: { header: chrome, footer: chrome } } }],
    website_pages: [{ organization_id: ORG, id: "home", slug: "home", is_visible: true }],
    website_sections: ["hero", "services", "contact"].map((kind) => ({ organization_id: ORG, id: kind, kind, is_visible: true })),
    services: [{ organization_id: ORG, id: "service", is_active: true }],
    user_roles: options.admin ? [{ user_id: USER, role: "super_admin" }] : [],
    website_branches: options.branch ? [{ organization_id: ORG, status: "open", label: "Pending changes" }] : [],
    website_versions: [{ organization_id: ORG, version: 2 }, { organization_id: OTHER, version: 99 }],
  };
  const client = { from(table: string) {
    const filters: [string, unknown][] = [];
    let pending: Row | null = null;
    reads.push({ table, filters });
    const rows = () => (tables[table] ?? []).filter((row) => filters.every(([key, value]) => row[key] === value));
    const chain = {
      select: () => chain,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
      order: () => chain, limit: () => chain,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      insert: async (row: Row) => {
        writes.push({ table, kind: "insert", row, filters });
        return { error: options.snapshotError ? { message: "fixture snapshot failure" } : null };
      },
      update: (row: Row) => { pending = row; writes.push({ table, kind: "update", row, filters }); return chain; },
      then: (resolve: (value: unknown) => unknown) => {
        const failed = options.publishError && table === "website_settings";
        // Like PostgREST: an update changes (and with .select() returns) only matching rows.
        if (pending && !failed) for (const row of rows()) Object.assign(row, pending);
        return resolve({ data: rows(), error: failed ? { message: "PRODUCTION_LOCKED" } : null });
      },
    };
    return chain;
  } };
  return { client, writes, reads, tables };
}
async function activate(db: ReturnType<typeof fixture>, extra: Row = {}) {
  const path = "./production.functions.ts?server-fn-module-lookup";
  const module = await import(/* @vite-ignore */ path);
  const handler = module["activateProduction"] as (input: unknown) => Promise<{ activated: boolean; version: number | null }>;
  return handler({ data: { organizationId: ORG, ...extra }, context: { supabase: db.client, userId: USER } });
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.audit.mockResolvedValue({ error: null });
  mock.qlog.mockResolvedValue({ error: null });
  mock.quality.mockResolvedValue({ ready: true, measured: true, productionReady: true, score: 95, blockers: [], issues: [] });
  mock.snapshot.mockResolvedValue({ pages: [{ id: "home", sections: [] }] });
  // The existing cases below are about the other gates; the video bar has its own describe at the end.
  vi.stubEnv("VIDEO_BAR_GATE", "off");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No network allowed in offline publish tests"); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("production publishing handler — offline fixtures, not live RLS proof", () => {
  it.each([null, "viewer", "member"])("denies role %s before snapshots or writes", async (role) => {
    const db = fixture({ role });
    await expect(activate(db)).rejects.toThrow("Only an owner");
    expect(db.writes).toEqual([]);
    expect(mock.snapshot).not.toHaveBeenCalled();
    expect(db.reads[0]?.filters).toEqual([["organization_id", ORG], ["user_id", USER]]);
  });
  it.each([{ unpaid: true }, { suspended: true }, { branch: true }, { unapproved: true }])("blocks a held or unready workspace without publishing: %j", async (options) => {
    const db = fixture(options);
    expect((await activate(db)).activated).toBe(false);
    expect(db.writes).toEqual([]);
    expect(mock.snapshot).not.toHaveBeenCalled();
  });
  it("requires measured browser quality rather than a content-only pass", async () => {
    mock.quality.mockResolvedValue({ ready: true, measured: false, productionReady: false, score: 95, blockers: [], issues: [] });
    const db = fixture();
    expect((await activate(db)).activated).toBe(false);
    expect(db.writes).toEqual([]);
  });
  it("saves the next workspace-scoped immutable snapshot before marking settings live", async () => {
    const db = fixture();
    expect(await activate(db)).toMatchObject({ activated: true, version: 3 });
    expect(mock.snapshot).toHaveBeenCalledWith(db.client, ORG);
    expect(db.writes.map((write) => [write.table, write.kind])).toEqual([["website_versions", "insert"], ["website_settings", "update"]]);
    expect(db.writes[0]?.row).toMatchObject({ organization_id: ORG, version: 3, pages: { live_format: 1 } });
    expect(db.writes[1]?.filters).toEqual([["organization_id", ORG]]);
    expect(db.tables["website_versions"]?.find((row) => row["organization_id"] === OTHER)?.["version"]).toBe(99);
  });
  it("leaves website_settings in a state the public-form gate (ORG_NOT_PUBLIC) accepts", async () => {
    const db = fixture();
    await activate(db);
    expect(db.tables["website_settings"]?.[0]).toMatchObject({ published: true, publish_state: "published" });
  });
  it("never reports live when the publish update matched no website_settings row", async () => {
    const db = fixture();
    const original = db.client.from.bind(db.client);
    (db.client as unknown as { from: (table: string) => unknown }).from = (table: string) => {
      const chain = original(table) as Record<string, unknown> & { update: (row: Row) => unknown };
      if (table !== "website_settings") return chain;
      const update = chain.update;
      chain.update = (row: Row) => {
        update(row);
        return { eq: () => ({ select: async () => ({ data: [], error: null }) }) };
      };
      return chain as never;
    };
    await expect(activate(db)).rejects.toThrow("couldn't take the website live");
  });
  it("does not mark settings live if saving the production snapshot fails", async () => {
    const db = fixture({ snapshotError: true });
    await expect(activate(db)).rejects.toThrow("not published");
    expect(db.writes.map((write) => write.table)).toEqual(["website_versions"]);
  });
  it("does not report success when the database activation guard rejects publishing", async () => {
    const db = fixture({ publishError: true });
    await expect(activate(db)).rejects.toThrow("setup");
    expect(mock.audit.mock.calls.some(([row]) => row.action === "PRODUCTION_ACTIVATED")).toBe(false);
  });
});
describe("video-bar publish block (same offline fixtures)", () => {
  const bp = blueprintFor("roofing");
  const below = () => ({ score: scoreVideoBar(badSite(bp)), previousScore: null, tradeSlug: bp.slug, blueprintSource: bp.source });
  const above = () => ({ score: scoreVideoBar(goodSite(bp)), previousScore: null, tradeSlug: bp.slug, blueprintSource: bp.source });
  const actions = () => mock.audit.mock.calls.map(([row]) => row.action);
  beforeEach(() => { vi.stubEnv("VIDEO_BAR_GATE", "enforce"); });

  it("blocks a site under the bar, publishes nothing, tells the owner what to fix and logs why", async () => {
    mock.videoBar.mockResolvedValue(below());
    const db = fixture();
    const result = (await activate(db)) as unknown as { activated: boolean; reason: string };
    expect(result.activated).toBe(false);
    expect(result.reason).toMatch(/not at our quality bar yet/);
    expect(result.reason).toMatch(/Fix these, then publish again/);
    expect(db.writes).toEqual([]);
    const blocked = mock.audit.mock.calls.map(([row]) => row).find((row) => row.action === "PUBLISH_BLOCKED");
    expect(blocked.metadata).toMatchObject({ reason: "video_bar_below_bar", video_bar: { bar: 85, tradeSlug: bp.slug } });
    expect(blocked.metadata.video_bar.failures).toContain("truth_facts");
  });

  it("logs the publish check per trade for super admins to read, and a log failure never blocks publishing", async () => {
    mock.videoBar.mockResolvedValue(below());
    await activate(fixture());
    await vi.waitFor(() => expect(mock.qlog).toHaveBeenCalledTimes(1));
    expect(mock.qlog.mock.calls[0]![0]).toMatchObject({ organization_id: ORG, trade_slug: bp.slug, event_kind: "publish_check", bar: 85, passed: false, gate_mode: "enforce" });
    mock.qlog.mockRejectedValue(new Error("table missing"));
    mock.videoBar.mockResolvedValue(above());
    expect(await activate(fixture())).toMatchObject({ activated: true });
  });

  it("publishes a site that meets the bar", async () => {
    mock.videoBar.mockResolvedValue(above());
    const db = fixture();
    expect(await activate(db)).toMatchObject({ activated: true, version: 3 });
  });

  it("fails closed when the score cannot be computed", async () => {
    mock.videoBar.mockRejectedValue(new Error("db down"));
    const db = fixture();
    expect((await activate(db)).activated).toBe(false);
    expect(db.writes).toEqual([]);
  });

  it("warn mode shows the score but does not block", async () => {
    vi.stubEnv("VIDEO_BAR_GATE", "warn");
    mock.videoBar.mockResolvedValue(below());
    expect((await activate(fixture())).activated).toBe(true);
  });

  it("an ordinary owner cannot override, and the attempt is logged", async () => {
    mock.videoBar.mockResolvedValue(below());
    const db = fixture({ role: "owner" });
    expect((await activate(db, { videoBarOverrideReason: "client is waiting" })).activated).toBe(false);
    expect(actions()).toContain("PUBLISH_VIDEO_BAR_OVERRIDE_DENIED");
    expect(actions()).not.toContain("PUBLISH_VIDEO_BAR_OVERRIDE");
    expect(db.writes).toEqual([]);
  });

  it("a platform admin can override with a reason, and the override is logged", async () => {
    mock.videoBar.mockResolvedValue(below());
    const db = fixture({ role: "admin", admin: true });
    expect(await activate(db, { videoBarOverrideReason: "Adam approved this build for the demo" })).toMatchObject({ activated: true });
    const row = mock.audit.mock.calls.map(([r]) => r).find((r) => r.action === "PUBLISH_VIDEO_BAR_OVERRIDE");
    expect(row.metadata).toMatchObject({ reason: "Adam approved this build for the demo", video_bar: { bar: 85 } });
    expect(actions()).not.toContain("PUBLISH_BLOCKED");
  });

  it("an admin override never bypasses any other failing check", async () => {
    mock.videoBar.mockResolvedValue(below());
    const db = fixture({ admin: true, unapproved: true });
    expect((await activate(db, { videoBarOverrideReason: "client is waiting" })).activated).toBe(false);
    expect(db.writes).toEqual([]);
  });

  it("a live edit is only stopped when it makes the live site worse", async () => {
    const { publishSiteNow } = await import("./production.functions");
    const bad = below();
    mock.videoBar.mockResolvedValue({ ...bad, previousScore: bad.score.score });
    const same = await publishSiteNow(fixture().client as never, USER, ORG, { liveEdit: true });
    expect(same.activated).toBe(true);
    mock.videoBar.mockResolvedValue({ ...bad, previousScore: bad.score.score + 10 });
    const worse = await publishSiteNow(fixture().client as never, USER, ORG, { liveEdit: true });
    expect(worse.activated).toBe(false);
    mock.videoBar.mockResolvedValue({ ...bad, previousScore: null });
    expect((await publishSiteNow(fixture().client as never, USER, ORG, { liveEdit: true })).activated).toBe(false);
  });
});
