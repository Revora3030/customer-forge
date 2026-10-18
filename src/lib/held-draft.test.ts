/**
 * Held preview during a fresh rebuild: the owner's draft keeps showing the
 * pre-rebuild restore point, read only for the caller's own organization and
 * only on the authorised draft path. Visitors never see it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

type Row = Record<string, unknown>;
const db: { tables: Record<string, Row[]>; reads: string[] } = { tables: {}, reads: [] };

/** Minimal PostgREST-like fake that honours eq/in filters. */
function fakeClient() {
  return {
    from(table: string) {
      db.reads.push(table);
      const filters: ((row: Row) => boolean)[] = [];
      const rows = () => (db.tables[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
      const chain = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          if (!column.includes("->")) filters.push((row) => row[column] === value);
          return chain;
        },
        in: (column: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[column]));
          return chain;
        },
        not: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: rows(), error: null }),
      };
      return chain;
    },
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
  };
}

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: fakeClient() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => fakeClient() }));

import { heldDraftSource, heldSnapshotFromBackup, loadHeldSnapshot } from "./public-site.functions";
import { loadSite, type LiveSnapshot } from "./public-site.server";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const BACKUP = "33333333-3333-4333-8333-333333333333";
const JOB = "44444444-4444-4444-8444-444444444444";

const marker = (over: Row = {}) => ({
  pendingBuild: { mode: "fresh_replace", backupId: BACKUP, jobId: JOB, ...over },
});

const snapshot = (org = ORG) => ({
  format: 1,
  organization_id: org,
  website: {
    format: "1",
    pages: [
      {
        id: "held-home",
        slug: "home",
        title: "Home",
        kind: "home",
        is_visible: true,
        sort_order: 0,
        sections: [
          {
            id: "held-hero",
            kind: "hero",
            variant: "default",
            heading: "The site before the rebuild",
            is_visible: true,
            sort_order: 0,
            components: [],
          },
        ],
      },
    ],
  },
  tables: { website_settings: [{ pages: { nav: [] }, seo: { headline: "Held" }, generation: { held: true } }] },
});

describe("heldDraftSource", () => {
  const active = { id: JOB, status: "processing" };
  it("names the backup only for the active fresh_replace job", () => {
    expect(heldDraftSource(marker(), active)).toBe(BACKUP);
    expect(heldDraftSource(marker(), { id: JOB, status: "queued" })).toBe(BACKUP);
  });
  it.each([
    ["a safe rebuild", marker({ mode: "safe" }), active],
    ["another job's marker", marker({ jobId: "other" }), active],
    ["a finished job", marker(), { id: JOB, status: "completed" }],
    ["a failed job", marker(), { id: JOB, status: "failed" }],
    ["no active job", marker(), null],
    ["a marker without jobId", marker({ jobId: undefined }), active],
    ["a malformed backup id", marker({ backupId: "x;drop" }), active],
    ["no marker", {}, active],
    ["no generation", null, active],
  ])("returns null for %s", (_label, generation, job) => {
    expect(heldDraftSource(generation, job)).toBeNull();
  });
});

describe("held backup read", () => {
  beforeEach(() => {
    db.tables = {};
    db.reads = [];
  });

  it("maps the restore point into the live snapshot shape", async () => {
    db.tables["data_backups"] = [{ id: BACKUP, organization_id: ORG, kind: "pre_restore", snapshot: snapshot() }];
    const held = await loadHeldSnapshot(fakeClient(), { backupId: BACKUP, organizationId: ORG });
    expect(held?.pages[0]?.["slug"]).toBe("home");
    expect(held?.pages[0]?.sections[0]?.components).toEqual([]);
    expect(held?.seo).toEqual({ headline: "Held" });
    expect(held?.generation).toEqual({ held: true });
    expect(held?.settingsPages).toEqual({ nav: [] });
  });

  it("ignores a backup id that belongs to another organization", async () => {
    db.tables["data_backups"] = [{ id: BACKUP, organization_id: OTHER, kind: "pre_restore", snapshot: snapshot(OTHER) }];
    expect(await loadHeldSnapshot(fakeClient(), { backupId: BACKUP, organizationId: ORG })).toBeNull();
  });

  it("ignores backups that are not pre-rebuild restore points", async () => {
    db.tables["data_backups"] = [{ id: BACKUP, organization_id: ORG, kind: "manual", snapshot: snapshot() }];
    expect(await loadHeldSnapshot(fakeClient(), { backupId: BACKUP, organizationId: ORG })).toBeNull();
  });

  it("rejects a snapshot whose own organization does not match, or with no sections", () => {
    expect(heldSnapshotFromBackup({ id: BACKUP, organization_id: ORG, snapshot: snapshot(OTHER) }, ORG)).toBeNull();
    expect(
      heldSnapshotFromBackup({ id: BACKUP, organization_id: ORG, snapshot: { website: { pages: [{ id: "p" }] } } }, ORG),
    ).toBeNull();
    expect(heldSnapshotFromBackup({ id: BACKUP, organization_id: ORG, snapshot: "nope" }, ORG)).toBeNull();
  });

  it("getOwnerDraftSite pins the read to the RLS-resolved org and kind", () => {
    const src = readFileSync("src/lib/public-site.functions.ts", "utf8");
    expect(src).toContain('.eq("id", input.backupId)');
    expect(src).toContain('.eq("organization_id", input.organizationId)');
    expect(src).toContain('.eq("kind", "pre_restore")');
    expect(src).toMatch(/loadHeldSnapshot\(supabaseAdmin, \{ backupId, organizationId: org\.id \}\)/);
    expect(src).toMatch(/heldDraftSource\(settingsRow\?\.generation \?\? null, job\)/);
    expect(src).toContain("heldSite.org.id === org.id");
  });
});

describe("loadSite honours heldSnapshot only on the draft path", () => {
  const held: LiveSnapshot = {
    versionId: `backup:${BACKUP}`,
    version: 0,
    publishedAt: null,
    settingsPages: null,
    seo: null,
    generation: null,
    pages: snapshot().website.pages as LiveSnapshot["pages"],
  };

  beforeEach(() => {
    db.reads = [];
    db.tables = {
      organizations: [{ id: ORG, name: "Acme", slug: "acme", industry: null, is_demo: true, is_suspended: false }],
      website_settings: [{ organization_id: ORG, publish_state: "draft", published: false }],
      public_website_settings: [],
      // The working tree mid-rebuild: empty.
      website_pages: [],
      website_sections: [],
    };
  });

  it("renders the held tree for the owner draft", async () => {
    const site = await loadSite("acme", { allowUnpublished: true, heldSnapshot: held });
    expect(site?.content?.page.id).toBe("held-home");
    expect(site?.content?.sections[0]?.heading).toBe("The site before the rebuild");
    expect(db.reads).not.toContain("website_pages");
  });

  it("ignores the held tree for public visitors", async () => {
    // An unpublished site is not served publicly at all, held tree or not.
    expect(await loadSite("acme", { heldSnapshot: held })).toBeNull();
    db.tables["public_website_settings"] = [{ organization_id: ORG, publish_state: "published", published: true }];
    db.tables["website_pages"] = [];
    const site = await loadSite("acme", { heldSnapshot: held });
    expect(site?.content ?? null).toBeNull();
    expect(db.reads).toContain("website_versions");
  });
});
