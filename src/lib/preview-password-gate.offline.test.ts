import { describe, expect, it, vi } from "vitest";
type Row = Record<string, unknown>;
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, writes: [] as Row[], reads: [] as string[] }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
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
  },
}));
import { resolvePreviewToken } from "./public-site.server";

const future = new Date(Date.now() + 3600_000).toISOString();
const past = new Date(Date.now() - 3600_000).toISOString();
function seed(link: Row = {}) {
  db.writes = []; db.reads = [];
  db.tables = {
    website_preview_links: [{ id: "link", token: "fixture-token-1234567", organization_id: "workspace", expires_at: future, revoked: false, views: 2, label: "For Maria", ...link }],
    organizations: [{ id: "workspace", slug: "fixture" }],
  };
}

describe("resolvePreviewToken with the password gate", () => {
  it("works exactly as before when no gate is given", async () => {
    seed();
    expect(await resolvePreviewToken("fixture-token-1234567")).toMatchObject({ ok: true, slug: "fixture", linkId: "link" });
    expect(db.writes).toHaveLength(1);
  });

  it("keeps a locked link closed: no business read, no view counted, no label", async () => {
    seed();
    const gate = vi.fn(async () => false);
    const result = await resolvePreviewToken("fixture-token-1234567", { beforeCount: gate });
    expect(result).toEqual({ ok: false, reason: "password" });
    expect(gate).toHaveBeenCalledWith({ id: "link" });
    expect(db.reads).toEqual(["website_preview_links"]);
    expect(db.writes).toEqual([]);
  });

  it("opens and counts the view once the gate says yes", async () => {
    seed();
    expect(await resolvePreviewToken("fixture-token-1234567", { beforeCount: async () => true })).toMatchObject({ ok: true, label: "For Maria" });
    expect(db.writes).toHaveLength(1);
  });

  it("expired and revoked links win over the password prompt, and an unknown link never reaches the gate", async () => {
    const gate = vi.fn(async () => false);
    seed({ expires_at: past });
    expect(await resolvePreviewToken("fixture-token-1234567", { beforeCount: gate })).toEqual({ ok: false, reason: "expired" });
    seed({ revoked: true });
    expect(await resolvePreviewToken("fixture-token-1234567", { beforeCount: gate })).toEqual({ ok: false, reason: "revoked" });
    seed();
    expect(await resolvePreviewToken("some-other-token-0000", { beforeCount: gate })).toEqual({ ok: false, reason: "unknown" });
    expect(gate).not.toHaveBeenCalled();
  });
});
