import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, reads: [] as string[], writes: [] as Row[] }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from(table: string) {
    db.reads.push(table);
    const filters: [string, unknown][] = [];
    const chain = {
      select: () => chain,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return chain; },
      maybeSingle: async () => ({ data: (db.tables[table] ?? []).find((row) => filters.every(([key, value]) => row[key] === value)) ?? null, error: null }),
      update: (row: Row) => { db.writes.push(row); return chain; },
      then: (resolve: (result: unknown) => unknown) => resolve({ error: null }),
    };
    return chain;
  },
} }));
import { resolvePreviewToken } from "./public-site.server";
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));
  db.reads = []; db.writes = [];
  db.tables = {
    website_preview_links: [{ id: "link", token: "fixture-token", organization_id: "workspace", expires_at: "2026-10-21T15:00:00Z", revoked: false, views: 2, label: "Fixture" }],
    organizations: [{ id: "workspace", slug: "fixture" }],
  };
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("No external requests"); }));
});
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("shared token resolution offline", () => {
  it("rejects unknown tokens before organization reads or view updates", async () => {
    expect(await resolvePreviewToken("unknown-token")).toEqual({ ok: false, reason: "unknown" });
    expect(db.reads).toEqual(["website_preview_links"]); expect(db.writes).toEqual([]);
  });
  it.each([
    { revoked: true, reason: "revoked" },
    { expires_at: "2026-10-20T15:00:00Z", reason: "expired" },
    { expires_at: "2026-10-19T15:00:00Z", reason: "expired" },
    { expires_at: "not-a-date", reason: "expired" },
  ])("fails closed for %j without reading a business", async ({ reason, ...values }) => {
    Object.assign(db.tables["website_preview_links"]?.[0] ?? {}, values);
    expect(await resolvePreviewToken("fixture-token")).toEqual({ ok: false, reason });
    expect(db.reads).toEqual(["website_preview_links"]); expect(db.writes).toEqual([]);
  });
  it("rejects links whose business is missing", async () => {
    db.tables["organizations"] = [];
    expect(await resolvePreviewToken("fixture-token")).toEqual({ ok: false, reason: "unknown" });
    expect(db.writes).toEqual([]);
  });
  it("resolves only the token workspace and records one view", async () => {
    expect(await resolvePreviewToken("fixture-token")).toMatchObject({ ok: true, organizationId: "workspace", slug: "fixture" });
    expect(db.writes).toEqual([{ views: 3, last_viewed_at: "2026-10-20T15:00:00.000Z" }]);
  });
});