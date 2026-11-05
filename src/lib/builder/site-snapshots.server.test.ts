import { describe, expect, it } from "vitest";
import {
  cleanName,
  cleanTrade,
  hoursText,
  listSnapshots,
  saveSnapshotFromSite,
  startFromSnapshot,
} from "./site-snapshots.server";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

const ORG = "11111111-1111-4111-8111-111111111111";
const NEW_ORG = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";

/** Tiny in-memory stand-in for the query builder the module uses. */
function fakeDb(tables: Tables, opts: { failInsert?: string; duplicate?: boolean } = {}) {
  let n = 0;
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: Array<(r: Row) => boolean> = [];
    let op: "select" | "insert" | "delete" = "select";
    let payload: Row[] = [];
    let limit = Infinity;
    const run = () => {
      if (op === "insert") {
        if (opts.failInsert === table) return { data: null, error: { code: "X" } };
        if (opts.duplicate && table === "site_snapshots")
          return { data: null, error: { code: "23505" } };
        const made = payload.map((r) => ({ id: `id-${++n}`, ...r }));
        rows.push(...made);
        return { data: made, error: null };
      }
      if (op === "delete") {
        const keep = rows.filter((r) => !filters.every((f) => f(r)));
        rows.length = 0;
        rows.push(...keep);
        return { data: null, error: null };
      }
      return { data: rows.filter((r) => filters.every((f) => f(r))).slice(0, limit), error: null };
    };
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (p: Row | Row[]) => ((op = "insert"), (payload = Array.isArray(p) ? p : [p]), b),
      delete: () => ((op = "delete"), b),
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), b),
      order: () => b,
      limit: (l: number) => ((limit = l), b),
      maybeSingle: async () => {
        const r = run();
        return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error };
      },
      single: async () => {
        const r = run();
        return { data: (r.data as Row[] | null)?.[0] ?? null, error: r.error };
      },
      then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
    };
    return b;
  };
  return { from } as unknown as Parameters<typeof listSnapshots>[0];
}

function sourceSite(): Tables {
  return {
    organizations: [{ id: ORG, name: "Sparkle Pro Cleaning LLC" }],
    business_profiles: [
      {
        organization_id: ORG,
        owner_name: "Marisol Quintero",
        email: "hello@sparklepro.test",
        phone: "(512) 555-0147",
        address: "88 Cedar Hollow Rd, Austin, TX 78701",
        city: "Austin",
        hours: { weekdays: "Mon-Fri 8am-5pm" },
      },
    ],
    website_pages: [
      {
        id: "p1",
        organization_id: ORG,
        kind: "home",
        slug: "home",
        title: "Sparkle Pro Cleaning LLC",
        sort_order: 0,
        seo_title: "Cleaning in Austin",
        seo_description: "Call (512) 555-0147",
      },
      {
        id: "p2",
        organization_id: ORG,
        kind: "services",
        slug: "services",
        title: "Services",
        sort_order: 1,
        seo_title: null,
        seo_description: null,
      },
    ],
    website_sections: [
      {
        organization_id: ORG,
        page_id: "p1",
        kind: "hero",
        variant: "default",
        sort_order: 0,
        heading: "Sparkle Pro Cleaning LLC in Austin",
        subheading: null,
        body: "Call (512) 555-0147",
        settings: {},
        is_visible: true,
      },
      {
        organization_id: ORG,
        page_id: "p2",
        kind: "list",
        variant: "default",
        sort_order: 0,
        heading: "What we clean",
        subheading: null,
        body: "Homes and offices",
        settings: {},
        is_visible: true,
      },
      {
        organization_id: ORG,
        page_id: "p2",
        kind: "list",
        variant: "default",
        sort_order: 1,
        heading: "Hidden",
        subheading: null,
        body: "Draft only",
        settings: {},
        is_visible: false,
      },
    ],
  };
}

describe("helpers", () => {
  it("normalises trade and name", () => {
    expect(cleanTrade("  Home   Cleaning ")).toBe("home cleaning");
    expect(cleanName("  Clean   v1 ")).toBe("Clean v1");
  });
  it("reads opening hours from text or json", () => {
    expect(hoursText("Mon-Fri")).toBe("Mon-Fri");
    expect(hoursText({ a: "Mon 8-5", b: "Tue 8-5", c: 4 })).toBe("Mon 8-5 Tue 8-5");
    expect(hoursText(null)).toBeNull();
  });
});

describe("saveSnapshotFromSite", () => {
  it("stores a scrubbed snapshot with none of the source facts", async () => {
    const tables = sourceSite();
    const res = await saveSnapshotFromSite(fakeDb(tables), {
      organizationId: ORG,
      trade: "Cleaning",
      name: "Clean v1",
      createdBy: USER,
    });
    expect(res.ok).toBe(true);
    const saved = tables["site_snapshots"]![0]!;
    expect(saved["trade"]).toBe("cleaning");
    expect(saved["source_organization_id"]).toBe(ORG);
    expect(saved["created_by"]).toBe(USER);
    const text = JSON.stringify(saved["snapshot"]);
    for (const secret of ["Sparkle", "555-0147", "sparklepro", "Cedar Hollow", "Marisol"])
      expect(text).not.toContain(secret);
    // The unpublished section is not copied.
    expect(saved["section_count"]).toBe(2);
    expect(saved["page_count"]).toBe(2);
  });

  it("refuses an empty site, bad input, and a duplicate name", async () => {
    const empty = sourceSite();
    empty["website_pages"] = [];
    expect(
      await saveSnapshotFromSite(fakeDb(empty), {
        organizationId: ORG,
        trade: "cleaning",
        name: "x",
        createdBy: USER,
      }),
    ).toMatchObject({ ok: false, reason: "empty_site" });
    expect(
      await saveSnapshotFromSite(fakeDb(sourceSite()), {
        organizationId: "nope",
        trade: "cleaning",
        name: "x",
        createdBy: USER,
      }),
    ).toMatchObject({ ok: false, reason: "bad_input" });
    expect(
      await saveSnapshotFromSite(fakeDb(sourceSite()), {
        organizationId: ORG,
        trade: "",
        name: "x",
        createdBy: USER,
      }),
    ).toMatchObject({ ok: false, reason: "bad_input" });
    expect(
      await saveSnapshotFromSite(fakeDb(sourceSite(), { duplicate: true }), {
        organizationId: ORG,
        trade: "cleaning",
        name: "x",
        createdBy: USER,
      }),
    ).toMatchObject({ ok: false, reason: "exists" });
    expect(
      await saveSnapshotFromSite(fakeDb(sourceSite(), { failInsert: "site_snapshots" }), {
        organizationId: ORG,
        trade: "cleaning",
        name: "x",
        createdBy: USER,
      }),
    ).toMatchObject({ ok: false, reason: "failed" });
  });

  it("refuses to save when a fact can't be removed, without echoing it", async () => {
    const tables = sourceSite();
    // A phone number split by markup the scrubber can't see through is the realistic leak; here a stray url.
    tables["website_sections"]![1]!["settings"] = { note: "see https://sparklepro.example/menu" };
    const res = await saveSnapshotFromSite(fakeDb(tables), {
      organizationId: ORG,
      trade: "cleaning",
      name: "x",
      createdBy: USER,
    });
    // Either scrubbed (ok) or refused; it must never store a url.
    if (res.ok)
      expect(JSON.stringify(tables["site_snapshots"]![0]!["snapshot"])).not.toContain(
        "sparklepro.example",
      );
    else expect(res.message).not.toContain("sparklepro");
  });
});

describe("startFromSnapshot", () => {
  async function savedTables() {
    const tables = sourceSite();
    await saveSnapshotFromSite(fakeDb(tables), {
      organizationId: ORG,
      trade: "cleaning",
      name: "Clean v1",
      createdBy: USER,
    });
    tables["organizations"]!.push({ id: NEW_ORG, name: "Bright Day Maids" });
    tables["business_profiles"]!.push({
      organization_id: NEW_ORG,
      phone: "(206) 482-3344",
      city: "Seattle",
    });
    return tables;
  }

  it("fills an empty site with the new owner's own facts and marks what's missing", async () => {
    const tables = await savedTables();
    const snapshotId = String(tables["site_snapshots"]![0]!["id"]);
    // Row ids from the fake aren't uuids; use real-looking ones.
    const sid = "44444444-4444-4444-8444-444444444444";
    tables["site_snapshots"]![0]!["id"] = sid;
    void snapshotId;
    const res = await startFromSnapshot(fakeDb(tables), {
      organizationId: NEW_ORG,
      snapshotId: sid,
    });
    expect(res).toMatchObject({ ok: true, pages: 2, sections: 2 });
    if (!res.ok) return;
    expect(res.missing.length).toBeGreaterThan(0);
    const newPages = tables["website_pages"]!.filter((p) => p["organization_id"] === NEW_ORG);
    const newSections = tables["website_sections"]!.filter((s) => s["organization_id"] === NEW_ORG);
    expect(newPages).toHaveLength(2);
    expect(newSections).toHaveLength(2);
    const text = JSON.stringify([newPages, newSections]);
    expect(text).toContain("Bright Day Maids");
    expect(text).toContain("(206) 482-3344");
    expect(text).not.toContain("Sparkle");
    // Every section hangs off a page of the NEW site.
    const ids = new Set(newPages.map((p) => p["id"]));
    expect(newSections.every((s) => ids.has(s["page_id"]))).toBe(true);
  });

  it("never touches a site that already has pages", async () => {
    const tables = await savedTables();
    const sid = "44444444-4444-4444-8444-444444444444";
    tables["site_snapshots"]![0]!["id"] = sid;
    tables["website_pages"]!.push({
      id: "np",
      organization_id: NEW_ORG,
      kind: "home",
      slug: "home",
      title: "Mine",
    });
    const before = tables["website_pages"]!.length;
    expect(
      await startFromSnapshot(fakeDb(tables), { organizationId: NEW_ORG, snapshotId: sid }),
    ).toMatchObject({ ok: false, reason: "site_not_empty" });
    expect(tables["website_pages"]).toHaveLength(before);
  });

  it("handles missing snapshot, bad ids and a failed section write (pages are undone)", async () => {
    const tables = await savedTables();
    const sid = "44444444-4444-4444-8444-444444444444";
    tables["site_snapshots"]![0]!["id"] = sid;
    expect(
      await startFromSnapshot(fakeDb(tables), {
        organizationId: NEW_ORG,
        snapshotId: "55555555-5555-4555-8555-555555555555",
      }),
    ).toMatchObject({ ok: false, reason: "not_found" });
    expect(
      await startFromSnapshot(fakeDb(tables), { organizationId: "x", snapshotId: sid }),
    ).toMatchObject({ ok: false, reason: "bad_input" });
    const res = await startFromSnapshot(fakeDb(tables, { failInsert: "website_sections" }), {
      organizationId: NEW_ORG,
      snapshotId: sid,
    });
    expect(res).toMatchObject({ ok: false, reason: "failed" });
    expect(tables["website_pages"]!.filter((p) => p["organization_id"] === NEW_ORG)).toHaveLength(
      0,
    );
  });
});

describe("listSnapshots", () => {
  it("lists without bodies", async () => {
    const tables = sourceSite();
    await saveSnapshotFromSite(fakeDb(tables), {
      organizationId: ORG,
      trade: "cleaning",
      name: "v1",
      createdBy: USER,
    });
    const list = await listSnapshots(fakeDb(tables));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ trade: "cleaning", name: "v1", pageCount: 2 });
    expect(JSON.stringify(list)).not.toContain('sections"');
  });
});
