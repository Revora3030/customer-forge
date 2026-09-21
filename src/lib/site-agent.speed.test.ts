/**
 * Speed pass evidence for a large build.
 *
 * The apply loop must keep writing in order — that ordering is what makes a
 * failed batch reversible — so the speed work targets the *reads*. Every step
 * used to read the database twice before writing (once to record how to undo it,
 * once more for JSON-column steps). These tests count real round trips through a
 * fake client, so the improvement is measured rather than assumed, and they check
 * the batched capture records exactly the same reversal as the per-step one.
 */
import { describe, expect, it } from "vitest";
import {
  captureUndo,
  captureUndoFrom,
  loadUndoSnapshot,
  type JournalClient,
} from "@/lib/site-agent.atomic";
import type { AgentAction } from "@/lib/site-agent";

type Row = Record<string, unknown>;

/** A minimal stand-in for the Supabase chain that counts reads and writes. */
function fakeClient(tables: Record<string, Row[]>) {
  const counts = { reads: 0, writes: 0 };
  const client = {
    from(table: string) {
      const rows = tables[table] ?? [];
      const filters: { id?: string; ids?: string[] } = {};
      const chain: Record<string, unknown> = {};
      const result = () => {
        counts.reads += 1;
        let data: Row[] = rows;
        if (filters.id) data = data.filter((row) => String(row["id"]) === filters.id);
        if (filters.ids) data = data.filter((row) => filters.ids!.includes(String(row["id"])));
        return Promise.resolve({ data, error: null });
      };
      Object.assign(chain, {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          if (column === "id") filters.id = String(value);
          return chain;
        },
        in: (_column: string, values: unknown[]) => {
          filters.ids = values.map((value) => String(value));
          return chain;
        },
        gte: () => chain,
        maybeSingle: async () => {
          const { data } = await result();
          return { data: data[0] ?? null, error: null };
        },
        then: (resolve: (value: { data: unknown; error: unknown }) => unknown) =>
          result().then(resolve),
        insert: () => {
          counts.writes += 1;
          return { then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r) };
        },
        update: () => {
          counts.writes += 1;
          return {
            eq: () => chain,
            then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r),
          };
        },
        delete: () => {
          counts.writes += 1;
          return {
            eq: () => chain,
            then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r),
          };
        },
      });
      return chain as never;
    },
  } as unknown as JournalClient;
  return { client, counts };
}

const ORG = "11111111-1111-1111-1111-111111111111";

/** A five-page build: pages, sections on each, components inside, plus polish. */
function largeBuild() {
  const sections: Row[] = [];
  const components: Row[] = [];
  const actions: AgentAction[] = [];
  for (let page = 0; page < 5; page += 1) {
    const pageId = `page-${page}`;
    actions.push({ type: "add_page", kind: "custom", title: `Page ${page}`, slug: `p${page}` });
    for (let index = 0; index < 6; index += 1) {
      const sectionId = `sec-${page}-${index}`;
      sections.push({ id: sectionId, organization_id: ORG, page_id: pageId, settings: {} });
      actions.push({
        type: "set_section_text",
        sectionId,
        field: "heading",
        value: `Heading ${index}`,
      });
      actions.push({ type: "set_section_visual", sectionId, patch: { tone: "calm" } });
      for (let slot = 0; slot < 2; slot += 1) {
        const componentId = `cmp-${page}-${index}-${slot}`;
        components.push({ id: componentId, organization_id: ORG, section_id: sectionId });
        actions.push({ type: "set_component", componentId, patch: { label: "Enquire" } });
      }
    }
  }
  return {
    actions,
    tables: {
      website_sections: sections,
      website_components: components,
      website_pages: [{ id: "page-existing", organization_id: ORG }],
    } as Record<string, Row[]>,
  };
}

describe("large build speed: undo capture round trips", () => {
  it("reads the database once per table instead of once per step", async () => {
    const { actions, tables } = largeBuild();

    const before = fakeClient(tables);
    for (const action of actions) await captureUndo(before.client, ORG, action);

    const after = fakeClient(tables);
    const snapshot = await loadUndoSnapshot(after.client, ORG, actions);
    for (const action of actions) captureUndoFrom(after.client, ORG, action, snapshot);

    // 5 pages x 6 sections x (1 text + 1 visual + 2 components) = 120 steps + 5 pages.
    expect(actions.length).toBe(125);
    expect(before.counts.reads).toBe(actions.length);
    expect(after.counts.reads).toBe(3);
    expect(snapshot.reads).toBe(3);
    expect(after.counts.reads).toBeLessThan(before.counts.reads / 20);
  });

  it("records the same reversal as the per-step capture", async () => {
    const tables: Record<string, Row[]> = {
      website_sections: [{ id: "sec-1", organization_id: ORG, heading: "Old", settings: {} }],
      website_components: [{ id: "cmp-1", organization_id: ORG, label: "Old" }],
      business_profiles: [{ organization_id: ORG, brand_tone: "warm" }],
    };
    const cases: AgentAction[] = [
      { type: "set_section_text", sectionId: "sec-1", field: "heading", value: "New" },
      { type: "delete_section", sectionId: "sec-1" },
      { type: "reorder_sections", pageId: "page-1", sectionIds: ["sec-1"] },
      { type: "set_component", componentId: "cmp-1", patch: { label: "New" } },
      { type: "set_theme", patch: { brand_tone: "bold" } },
      { type: "add_section", pageId: "page-1", kind: "features" },
    ];
    const fresh = fakeClient(tables);
    const batched = fakeClient(tables);
    const snapshot = await loadUndoSnapshot(batched.client, ORG, cases);
    for (const action of cases) {
      const expected = await captureUndo(fresh.client, ORG, action);
      const actual = captureUndoFrom(batched.client, ORG, action, snapshot);
      expect(actual.map((step) => step.label)).toEqual(expected.map((step) => step.label));
    }
  });

  it("records nothing for a row created earlier in the same batch", async () => {
    const actions: AgentAction[] = [
      { type: "set_section_text", sectionId: "sec-new", field: "heading", value: "Hi" },
    ];
    const { client } = fakeClient({ website_sections: [] });
    const snapshot = await loadUndoSnapshot(client, ORG, actions);
    // Its own insert step removes it, so restoring a mid-batch value would be wrong.
    expect(captureUndoFrom(client, ORG, actions[0]!, snapshot)).toEqual([]);
  });
});
