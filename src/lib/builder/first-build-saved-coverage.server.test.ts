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