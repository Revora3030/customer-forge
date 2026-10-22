import type { EditScopeContext } from "./edit-scope";

/** Structural coverage only. The model, never keywords, declares redesign intent. */
export function missingRedesignSections(
  proposal: Record<string, unknown> | null,
  actions: readonly unknown[],
  context: EditScopeContext,
): string[] {
  const scope = proposal?.["scope"] as Record<string, unknown> | undefined;
  if (scope?.["breadth"] !== "site" || scope["operation"] !== "redesign") return [];
  const covered = new Set<string>();
  const removedPages = new Set<string>();
  for (const raw of actions) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (row["type"] === "delete_page" && typeof row["pageId"] === "string") removedPages.add(row["pageId"]);
    if ((row["type"] === "set_composition" || row["type"] === "delete_section") && typeof row["sectionId"] === "string") covered.add(row["sectionId"]);
  }
  return context.pages.flatMap((page) => removedPages.has(page.id) ? [] : page.sections.filter((section) => !covered.has(section.id)).map((section) => section.id));
}