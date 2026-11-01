import { describe, expect, it } from "vitest";
import { saveFirstBuildComposition } from "./save-first-build-composition.server";
import type { CompositionTree } from "./composition-tree";

const section = { id: "section-a", kind: "contact", settings: { ownerSetting: true } };
const tree: CompositionTree = { version: 1, root: { type: "heading", text: "Contact", level: 1 } };

function fakeDb(data: { id: string }[] | null, error: { message: string } | null = null) {
  const filters: [string, string][] = [];
  let saved: unknown;
  const chain = {
    eq(column: string, value: string) { filters.push([column, value]); return chain; },
    select: async () => ({ data, error }),
  };
  return {
    db: { from: () => ({ update(value: unknown) { saved = value; return chain; } }) },
    filters,
    saved: () => saved,
  };
}

describe("first-build composition persistence", () => {
  it("saves only the requested tenant section and preserves its anchor role", async () => {
    const fake = fakeDb([{ id: section.id }]);
    await saveFirstBuildComposition(fake.db, "workspace-a", section, tree);
    expect(fake.filters).toEqual([["id", "section-a"], ["organization_id", "workspace-a"]]);
    expect(fake.saved()).toMatchObject({ kind: "composition", settings: { ownerSetting: true, role: "contact", composition: tree } });
  });
  it.each([[], null, [{ id: "other" }], [{ id: section.id }, { id: section.id }]])("rejects an unverified update result %j", async (rows) => {
    await expect(saveFirstBuildComposition(fakeDb(rows).db, "workspace-a", section, tree)).rejects.toThrow("Couldn't verify the saved section design");
  });
  it("stores fallback markers when given, and a later AI save clears them", async () => {
    const fake = fakeDb([{ id: section.id }]);
    await saveFirstBuildComposition(fake.db, "workspace-a", section, tree, { layoutSource: "fallback", needsAiUpgrade: true });
    expect(fake.saved()).toMatchObject({ settings: { ownerSetting: true, layoutSource: "fallback", needsAiUpgrade: true, role: "contact" } });
    const upgraded = fakeDb([{ id: section.id }]);
    await saveFirstBuildComposition(upgraded.db, "workspace-a", { ...section, settings: { ownerSetting: true, layoutSource: "fallback", needsAiUpgrade: true } }, tree);
    const settings = (upgraded.saved() as { settings: Record<string, unknown> }).settings;
    expect(settings).toMatchObject({ ownerSetting: true, role: "contact" });
    expect(settings).not.toHaveProperty("layoutSource");
    expect(settings).not.toHaveProperty("needsAiUpgrade");
  });
  it("propagates write failures rather than claiming a saved section", async () => {
    await expect(saveFirstBuildComposition(fakeDb(null, { message: "write failed" }).db, "workspace-a", section, tree)).rejects.toThrow("write failed");
  });
});