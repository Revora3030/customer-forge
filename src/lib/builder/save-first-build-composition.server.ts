import { writeComposition, type CompositionTree } from "./composition-tree";

type SaveDb = {
  from(table: "website_sections"): {
    update(value: { kind: string; settings: Record<string, unknown> }): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          select(columns: "id"): PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>;
        };
      };
    };
  };
};

/** A tenant-scoped update is not a saved design until the expected row reads back. */
export async function saveFirstBuildComposition(
  db: SaveDb,
  organizationId: string,
  section: { id: string; kind: string; settings: unknown },
  tree: CompositionTree,
): Promise<void> {
  // Preserve the original role so conversion anchors still find their section.
  const settings = { ...writeComposition(section.settings, tree), role: section.kind };
  const { data, error } = await db.from("website_sections")
    .update({ kind: "composition", settings })
    .eq("id", section.id)
    .eq("organization_id", organizationId)
    .select("id");
  if (error) throw new Error(error.message);
  if (data?.length !== 1 || data[0]?.id !== section.id) {
    throw new Error("Couldn't verify the saved section design. The build has not completed.");
  }
}