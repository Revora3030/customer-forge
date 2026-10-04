import type { PublicSite } from "@/lib/public-site.functions";
import { readComposition } from "@/lib/builder/composition-tree";
import { safeText } from "@/lib/builder/presentation";

type Site = NonNullable<PublicSite>;
type Section = NonNullable<Site["content"]>["sections"][number];

/**
 * The page surface colour as #RRGGBB. A short #RGB value used to reach the
 * layout renderer unexpanded, where it was ignored, so the readability guard had
 * no surface to measure and white headings stayed white on pale surfaces.
 */
export function siteSurface(site: Site): string | null {
  const profile = (site.profile ?? null) as { secondary_color?: string | null } | null;
  return normalizeHex(profile?.secondary_color);
}

function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(raw)) return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : raw || null;
}

/**
 * The colour a section's text is actually drawn over: the section's own
 * background when the design gave it one, otherwise the page surface.
 * Measuring against the page surface while the section painted its own pale
 * grey panel is how white headings ended up invisible on light grey.
 */
export function sectionSurface(site: Site, sectionBg: string | null | undefined): string | null {
  return normalizeHex(sectionBg) && /^#[0-9a-f]{6}$/i.test(normalizeHex(sectionBg)!) ? normalizeHex(sectionBg) : siteSurface(site);
}

/** True when a stored AI layout for this section already draws a level-1 heading. */
export function compositionHasH1(section: Section): boolean {
  const tree = readComposition(section.settings);
  if (!tree) return false;
  const walk = (node: { type?: string; level?: number; children?: unknown[] }): boolean =>
    (node.type === "heading" && node.level === 1) ||
    (node.children ?? []).some((child) => walk(child as { type?: string; level?: number; children?: unknown[] }));
  return walk(tree.root as { type?: string; level?: number; children?: unknown[] });
}

/** Index of the section that should carry the page h1, or -1 when an AI layout already does. */
export function leadSectionIndex(sections: Section[]): number {
  if (sections.some(compositionHasH1)) return -1;
  return sections.findIndex((section) => !readComposition(section.settings) && Boolean(safeText(section.heading)));
}

/** True when any section's AI layout already places the named live widget. */
export function pageHasWidget(sections: Section[], name: string): boolean {
  const walk = (node: { type?: string; text?: string; children?: unknown[]; tabs?: { children?: unknown[] }[] }): boolean =>
    (node.type === "widget" && node.text === name) ||
    (node.children ?? []).some((child) => walk(child as never)) ||
    (node.tabs ?? []).some((tab) => (tab.children ?? []).some((child) => walk(child as never)));
  return sections.some((section) => {
    const tree = readComposition(section.settings);
    return tree ? walk(tree.root as never) : false;
  });
}
