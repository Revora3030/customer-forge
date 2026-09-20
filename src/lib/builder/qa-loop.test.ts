/**
 * POST-APPLY QA LOOP — check, repair what is provably safe, check again.
 *
 * These tests drive the real loop against an in-memory stand-in for the
 * database, so they prove the wiring: rows are read, the safe repair is
 * written with the organisation filter attached, and the second verdict is
 * measured from the re-read rows rather than assumed.
 */

import { describe, expect, it } from "vitest";
import { runQaRepairLoop } from "./qa-loop.server";

type Row = Record<string, unknown>;

type Update = { table: string; values: Row; filters: [string, unknown][] };

function fakeDb(tables: Record<string, Row[]>) {
  const updates: Update[] = [];

  const db = {
    from(table: string) {
      return {
        select() {
          return {
            eq(column: string, value: unknown) {
              return {
                order() {
                  return Promise.resolve({
                    data: (tables[table] ?? []).filter((row) => row[column] === value),
                  });
                },
              };
            },
          };
        },
        update(values: Row) {
          const filters: [string, unknown][] = [];
          const chain = {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              if (filters.length >= 2) {
                updates.push({ table, values, filters: [...filters] });
                for (const row of tables[table] ?? []) {
                  if (filters.every(([col, val]) => row[col] === val)) Object.assign(row, values);
                }
                return Promise.resolve({ error: null });
              }
              return chain;
            },
          };
          return chain;
        },
      };
    },
  };

  return { db: db as never, updates };
}

const ORG = "11111111-1111-1111-1111-111111111111";

type Site = { website_pages: Row[]; website_sections: Row[]; website_components: Row[] };

function siteWithMissingSeo(): Site {
  return {
    website_pages: [
      {
        id: "page-1",
        organization_id: ORG,
        slug: "",
        title: "Home",
        kind: "home",
        is_visible: true,
        noindex: false,
        seo_title: null,
        seo_description: null,
        sort_order: 0,
      },
    ],
    website_sections: [
      {
        id: "section-1",
        organization_id: ORG,
        page_id: "page-1",
        kind: "hero",
        variant: "default",
        is_visible: true,
        heading: "Reliable service, done right",
        subheading: "Serving the whole city",
        body: null,
        sort_order: 0,
      },
    ],
    website_components: [
      {
        id: "component-1",
        organization_id: ORG,
        section_id: "section-1",
        kind: "button",
        label: "Get a quote",
        body: null,
        link_label: "Get a quote",
        link_url: "/contact",
        sort_order: 0,
      },
    ],
  };
}

describe("post-apply QA loop", () => {
  it("fixes the page's own missing search title and re-checks the saved rows", async () => {
    const tables = siteWithMissingSeo();
    const { db, updates } = fakeDb(tables);

    const result = await runQaRepairLoop(db, ORG, "polish the home page");

    expect(result.repaired.length).toBeGreaterThan(0);
    expect(result.after.score).toBeGreaterThanOrEqual(result.before.score);
    expect(result.summary).toContain("checked again");

    // The repair used the page's own title — nothing was invented.
    expect(tables.website_pages[0]!["seo_title"]).toBe("Home");
  });

  it("scopes every repair write to the caller's own workspace", async () => {
    const tables = siteWithMissingSeo();
    const { db, updates } = fakeDb(tables);

    await runQaRepairLoop(db, ORG, "");

    expect(updates.length).toBeGreaterThan(0);
    for (const update of updates) {
      expect(update.filters.map(([column]) => column)).toContain("organization_id");
      expect(update.filters).toContainEqual(["organization_id", ORG]);
      // Only the two columns the safe-repair compiler may emit.
      for (const column of Object.keys(update.values)) {
        expect(["seo_title", "seo_description", "link_url"]).toContain(column);
      }
    }
  });

  it("reports an already-correct site without writing anything", async () => {
    const tables = siteWithMissingSeo();
    tables.website_pages[0]!["seo_title"] = "Home — city plumbing";
    tables.website_pages[0]!["seo_description"] =
      "Book a visit from a local plumber covering the whole city, seven days a week.";
    // Every link already points at a real page, so there is nothing to repair.
    tables.website_components[0]!["link_url"] = "/";
    const { db, updates } = fakeDb(tables);

    const result = await runQaRepairLoop(db, ORG, "");

    expect(result.repaired).toEqual([]);
    expect(updates).toEqual([]);
    expect(result.summary).toContain("Nothing needed an automatic repair");
  });
});
