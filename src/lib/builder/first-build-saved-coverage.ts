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

/** Every website-picture reference saved in compositions (temp_ refs are never valid after apply). */
export function savedPictureRefs(sections: readonly SavedBuildSection[]): Map<string, string> {
  const refs = new Map<string, string>();
  const visit = (value: unknown, sectionId: string) => {
    if (Array.isArray(value)) return value.forEach(item => visit(item, sectionId));
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === "mediaRef" && typeof child === "string" && child) refs.set(child, sectionId);
      else visit(child, sectionId);
    }
  };
  for (const section of sections) visit(section.settings, section.id);
  return refs;
}

/** Pictures the design asks for but the website's media library does not hold render as blanks. */
export function missingPictureProblems(sections: readonly SavedBuildSection[], savedMediaIds: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  for (const [ref, sectionId] of savedPictureRefs(sections)) {
    if (!savedMediaIds.has(ref)) problems.push(`Section ${sectionId} shows a picture that was never saved`);
  }
  return problems;
}