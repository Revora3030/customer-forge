import { readComposition } from "./composition-tree";

export type SavedBuildPage = { id: string; slug: string };
export type SavedBuildSection = { id: string; page_id: string; kind: string; settings: unknown };
export type FirstBuildInventory = {
  pages: SavedBuildPage[];
  sections: { id: string; page_id: string; role: string }[];
};
export type ExpectedBuildCoverage = { pages: number; sections: number; inventory?: FirstBuildInventory };

function sameInventory(actual: readonly string[], expected: readonly string[]): boolean {
  if (actual.length !== expected.length) return false;
  const counts = new Map<string, number>();
  for (const key of expected) counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const key of actual) {
    const remaining = counts.get(key) ?? 0;
    if (!remaining) return false;
    counts.set(key, remaining - 1);
  }
  return true;
}

function savedSectionRole(section: SavedBuildSection): string {
  if (section.kind !== "composition") return section.kind;
  const settings = section.settings;
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return "";
  const role = (settings as Record<string, unknown>)["role"];
  return typeof role === "string" ? role : "";
}

/** Saved renderer coverage, not a creative template or a visual-quality score. */
export function firstBuildCoverageProblems(
  pages: readonly SavedBuildPage[],
  sections: readonly SavedBuildSection[],
  expected: ExpectedBuildCoverage,
): string[] {
  const problems: string[] = [];
  if (!pages.length || pages.length < expected.pages) problems.push("Saved page inventory is incomplete");
  if (sections.length < expected.sections) problems.push("Saved section inventory is incomplete");
  if (new Set(pages.map(page => page.id)).size !== pages.length) problems.push("Saved page inventory contains duplicate identities");
  if (new Set(sections.map(section => section.id)).size !== sections.length) problems.push("Saved section inventory contains duplicate identities");
  if (expected.inventory) {
    const pageKey = (page: SavedBuildPage) => JSON.stringify([page.id, page.slug]);
    if (!sameInventory(pages.map(pageKey), expected.inventory.pages.map(pageKey))) {
      problems.push("Saved pages do not match the accepted build inventory");
    }
    const sectionKey = (section: { id: string; page_id: string; role: string }) => JSON.stringify([section.id, section.page_id, section.role]);
    if (!sameInventory(sections.map(section => sectionKey({ ...section, role: savedSectionRole(section) })), expected.inventory.sections.map(sectionKey))) {
      problems.push("Saved sections do not match the accepted build inventory");
    }
  }
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