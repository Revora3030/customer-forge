type Section = { id: string; kind: string; heading: string | null; subheading: string | null };
/** Neighbor context is a semantic outline, never reusable content or media. */
export function pageArchitecture(sections: readonly Section[], targetId: string, pageSlug: string | null) {
  const outline = sections.map((section) => ({ role: section.kind, heading: section.heading, subheading: section.subheading }));
  const index = sections.findIndex((section) => section.id === targetId);
  return { pageSlug, index, total: outline.length, previous: outline[index - 1] ?? null, next: outline[index + 1] ?? null, orderedSections: outline };
}