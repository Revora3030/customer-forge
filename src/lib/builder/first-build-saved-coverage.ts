import { readComposition } from "./composition-tree";

export type SavedBuildPage = { id: string; slug: string };
export type SavedBuildSection = { id: string; page_id: string; kind: string; settings: unknown };

/** Saved renderer coverage, not a creative template or a visual-quality score. */
export function firstBuildCoverageProblems(
  pages: readonly SavedBuildPage[],
  sections: readonly SavedBuildSection[],
  expected: { pages: number; sections: number },
): string[] {
  const problems: string[] = [];
  if (!pages.length || pages.length < expected.pages) problems.push("Saved page inventory is incomplete");
  if (sections.length < expected.sections) problems.push("Saved section inventory is incomplete");
  const pageIds = new Set(pages.map(page => page.id));
  for (const page of pages) {
    if (!sections.some(section => section.page_id === page.id)) problems.push(`Page ${page.slug} has no sections`);
  }
  for (const section of sections) {
    if (!pageIds.has(section.page_id)) problems.push(`Section ${section.id} has no page`);
    // These two mechanics render outside composition; all other sections,
    // including contact/booking/quote widgets, need an authored design.
    if (section.kind === "embed" || section.kind === "post_list") continue;
    if (section.kind !== "composition" || !readComposition(section.settings)) {
      problems.push(`Section ${section.id} has no renderable AI design`);
    }
  }
  return problems;
}