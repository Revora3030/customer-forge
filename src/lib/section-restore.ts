/**
 * Granular rollback: put ONE section back the way it was in a saved version,
 * without touching any other part of the website.
 *
 * Pure helpers (unit tested). The server function reads the version, finds the
 * section by id, and rewrites just that section's own fields and its elements.
 */

import { readFullSnapshot, type FullComponent, type FullSection } from "@/lib/site-restore";

export type SectionHistoryEntry = {
  versionId: string;
  version: number;
  label: string | null;
  createdAt: string;
  /** Short preview so the owner can recognise the version. */
  heading: string | null;
  /** True when this version's copy differs from the next newer one. */
  changed: boolean;
};

/** Finds a section (by id) inside a stored version's `pages` value. */
export function sectionInVersion(pages: unknown, sectionId: string): FullSection | null {
  const stored = pages && typeof pages === "object" ? (pages as Record<string, unknown>) : null;
  const full = readFullSnapshot(stored) ?? readFullSnapshot(stored?.["full"]);
  if (!full) return null;
  for (const page of full.pages) for (const section of page.sections) if (section.id === sectionId) return section;
  return null;
}

/** Stable fingerprint of what the visitor sees in a section. */
export function sectionFingerprint(section: FullSection | null): string {
  if (!section) return "";
  return JSON.stringify([
    section.heading,
    section.subheading,
    section.body,
    section.settings,
    section.is_visible,
    section.components
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
      .map((c) => [c.kind, c.label, c.body, c.link_label, c.link_url, c.media_url, c.settings, c.is_visible]),
  ]);
}

/**
 * The versions in which a section exists, newest first, flagging the ones
 * where it actually looked different (so the list isn't 30 identical rows).
 */
export function sectionHistory(
  versions: readonly { id: string; version: number; label: string | null; created_at: string; pages: unknown }[],
  sectionId: string,
): SectionHistoryEntry[] {
  const sorted = [...versions].sort((a, b) => b.version - a.version);
  const out: SectionHistoryEntry[] = [];
  let newer: string | null = null;
  for (const row of sorted) {
    const section = sectionInVersion(row.pages, sectionId);
    if (!section) continue;
    const print = sectionFingerprint(section);
    out.push({
      versionId: row.id,
      version: row.version,
      label: row.label,
      createdAt: row.created_at,
      heading: section.heading?.slice(0, 80) ?? null,
      changed: newer === null || print !== newer,
    });
    newer = print;
  }
  return out;
}

export type SectionRestorePlan = {
  section: Pick<FullSection, "heading" | "subheading" | "body" | "settings" | "is_visible" | "variant">;
  /** Elements to delete (exist now, not in the version). */
  deleteComponentIds: string[];
  /** Elements to write back exactly as they were. */
  upsertComponents: FullComponent[];
};

/** Computes the minimal writes that make the section match the saved one. */
export function planSectionRestore(saved: FullSection, currentComponentIds: readonly string[]): SectionRestorePlan {
  const keep = new Set(saved.components.map((c) => c.id));
  return {
    section: {
      heading: saved.heading,
      subheading: saved.subheading,
      body: saved.body,
      settings: saved.settings,
      is_visible: saved.is_visible,
      variant: saved.variant,
    },
    deleteComponentIds: currentComponentIds.filter((id) => !keep.has(id)),
    upsertComponents: saved.components.map((c) => ({ ...c, section_id: saved.id })),
  };
}

/**
 * Builds a full snapshot that is the CURRENT site with exactly one section
 * replaced by its saved copy. Restoring this through the existing atomic
 * `restore_website_state` transaction changes that section (and its elements)
 * and nothing else — no partial writes are ever possible.
 *
 * Returns null when the section no longer exists on its page now (it was
 * deleted, or its page was): restoring it would need the page back too.
 */
export function withSectionFrom<T extends { pages: { id: string; sections: FullSection[] }[] }>(
  current: T,
  saved: FullSection,
): T | null {
  let found = false;
  const pages = current.pages.map((page) => {
    if (page.id !== saved.page_id) return page;
    const sections = page.sections.map((section) => {
      if (section.id !== saved.id) return section;
      found = true;
      // Keep the section's current position on the page; restore its content.
      return { ...saved, sort_order: section.sort_order, page_id: page.id };
    });
    return { ...page, sections };
  });
  return found ? { ...current, pages } : null;
}
