import { describe, expect, it } from "vitest";
import { assertFirstBuildSavedCoverage } from "./first-build-saved-coverage.server";
import type { SupabaseClient } from "@supabase/supabase-js";

const page = { id: "page-a", slug: "home" };
const section = { id: "section-a", page_id: page.id, kind: "composition", settings: {
  role: "hero", composition: { version: 1, root: { type: "heading", level: 1, text: "Owner material" } },
} };
const expected = { pages: 1, sections: 1, inventory: { pages: [page], sections: [{ id: section.id, page_id: page.id, role: "hero" }] } };

function database(rows: Record<string, unknown[]>, failedTable?: string) {
  const filters: [string, string, string][] = [];
  const db = { from(table: string) {
    const chain = {
      select: () => chain,
      eq(column: string, value: string) { filters.push([table, column, value]); return chain; },
      order: () => chain,
      range: async (from: number, to: number) => ({ data: (rows[table] ?? []).slice(from, to + 1), error: table === failedTable ? { message: "read failed" } : null }),
    };
    return chain;
  } };
  return { db: db as unknown as SupabaseClient, filters };
}

describe("first-build completion readback", () => {
  it("verifies persisted identities through organization-scoped reads", async () => {
    const fake = database({ website_pages: [page], website_sections: [section] });
    await expect(assertFirstBuildSavedCoverage(fake.db, "workspace-a", expected)).resolves.toBeUndefined();
    expect(fake.filters).toEqual([
      ["website_pages", "organization_id", "workspace-a"],
      ["website_sections", "organization_id", "workspace-a"],
    ]);
  });
  it("blocks completion when equal-count saved output belongs to the wrong inventory", async () => {
    const fake = database({ website_pages: [{ ...page, slug: "different" }], website_sections: [section] });
    await expect(assertFirstBuildSavedCoverage(fake.db, "workspace-a", expected)).rejects.toThrow("Saved pages do not match");
  });
  it.each(["website_pages", "website_sections"])("blocks completion when %s cannot be read", async (table) => {
    const fake = database({ website_pages: [page], website_sections: [section] }, table);
    await expect(assertFirstBuildSavedCoverage(fake.db, "workspace-a", expected)).rejects.toThrow("Couldn't verify saved website coverage");
  });
});

type Row = Record<string, unknown>;
/** A database that also answers `in` filters and records section updates. */
function pictureDatabase(tables: Record<string, Row[]>) {
  const updates: { table: string; id: string; settings: unknown }[] = [];
  const db = {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const chain = {
        select: () => chain,
        eq(column: string, value: string) { rows = rows.filter(row => column === "organization_id" || row[column] === value); return chain; },
        in(column: string, values: string[]) { rows = rows.filter(row => values.includes(String(row[column]))); return chain; },
        order: () => chain,
        range: async (from: number, to: number) => ({ data: rows.slice(from, to + 1), error: null }),
        update(value: { settings: unknown }) {
          return {
            eq: () => ({ eq: (_column: string, id: string) => ({ select: async () => { updates.push({ table, id, settings: value.settings }); return { data: [{ id }], error: null }; } }) }),
          };
        },
        then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
      };
      return chain;
    },
  };
  return { db: db as unknown as SupabaseClient, updates };
}

const COMPONENT = "0f6a1c34-52b7-4f0e-9d3a-1c2b3d4e5f60";
const GHOST = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const picturePage = (children: unknown[]) => ({
  ...section,
  settings: { role: "hero", composition: { version: 1, root: { type: "stack", children: [{ type: "heading", level: 1, text: "Owner material" }, ...children] } } },
});

describe("first-build completion readback: pictures", () => {
  it("keeps a picture whose reference is the id of a component that carries it (the renderer's meaning)", async () => {
    // Regression: references were looked up in the media library, where a
    // component id never is, so every picture of every build was stripped.
    const media = { type: "media", mediaRef: COMPONENT, alt: "A parked car" };
    const fake = pictureDatabase({
      website_pages: [page],
      website_sections: [picturePage([media])],
      website_components: [{ id: COMPONENT, media_url: "workspace-a/first-build-1-hero.png" }],
      media: [],
    });
    await expect(assertFirstBuildSavedCoverage(fake.db, "workspace-a", expected)).resolves.toBeUndefined();
    expect(fake.updates).toEqual([]);
  });

  it("accepts a reference to a media-library row too", async () => {
    const media = { type: "media", mediaRef: COMPONENT, alt: "A parked car" };
    const fake = pictureDatabase({ website_pages: [page], website_sections: [picturePage([media])], website_components: [], media: [{ id: COMPONENT }] });
    await expect(assertFirstBuildSavedCoverage(fake.db, "workspace-a", expected)).resolves.toBeUndefined();
    expect(fake.updates).toEqual([]);
  });

  it("repairs a picture that really was never saved, instead of failing the whole build", async () => {
    const fake = pictureDatabase({
      website_pages: [page],
      website_sections: [picturePage([{ type: "media", mediaRef: GHOST, alt: "Never made" }])],
      website_components: [],
      media: [],
    });
    await expect(assertFirstBuildSavedCoverage(fake.db, "workspace-a", expected)).resolves.toBeUndefined();
    expect(fake.updates).toHaveLength(1);
    expect(JSON.stringify(fake.updates[0]!.settings)).not.toContain(GHOST);
    expect(JSON.stringify(fake.updates[0]!.settings)).toContain("Owner material");
  });

  it("does not fail the build over a missing picture reference on a card or list item", async () => {
    const card = { type: "stack", mediaRef: GHOST, children: [{ type: "text", text: "Full detail" }] };
    const fake = pictureDatabase({ website_pages: [page], website_sections: [picturePage([card])], website_components: [], media: [] });
    await expect(assertFirstBuildSavedCoverage(fake.db, "workspace-a", expected)).resolves.toBeUndefined();
    expect(JSON.stringify(fake.updates[0]!.settings)).not.toContain(GHOST);
  });

  it("treats a component with no picture as unsaved", async () => {
    const media = { type: "media", mediaRef: COMPONENT, alt: "A parked car" };
    const fake = pictureDatabase({
      website_pages: [page],
      website_sections: [picturePage([media])],
      website_components: [{ id: COMPONENT, media_url: null }],
      media: [],
    });
    await expect(assertFirstBuildSavedCoverage(fake.db, "workspace-a", expected)).resolves.toBeUndefined();
    expect(fake.updates).toHaveLength(1);
    expect(JSON.stringify(fake.updates[0]!.settings)).not.toContain(COMPONENT);
  });
});
