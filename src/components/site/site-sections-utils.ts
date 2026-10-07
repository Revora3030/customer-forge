import type { PublicSite } from "@/lib/public-site.functions";
import {
  readComposition,
  type CompositionNode,
  type CompositionTree,
} from "@/lib/builder/composition-tree";
import { readableOn } from "@/lib/readable-color";
import { safeText } from "@/lib/builder/presentation";
import { safeLinkUrl } from "@/lib/website-content";

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

/** Legacy section kinds that must never choose a legacy renderer. */
export const LEGACY_SECTION_KINDS = new Set([
  "hero", "services", "process", "social_proof", "faq", "home", "page", "story", "values", "service_area",
]);

type CompositionAdapterOptions = {
  lead?: boolean;
  surface?: string | null;
  accent?: string | null;
};

const readSectionColor = (section: Section, key: string): string | null => {
  const settings = (section.settings ?? {}) as Record<string, unknown>;
  const style = settings["style"];
  const nested = style && typeof style === "object" && !Array.isArray(style)
    ? (style as Record<string, unknown>)
    : null;
  const value = nested?.[key] ?? settings[key];
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : null;
};

const sectionBackground = (section: Section, surface?: string | null): string =>
  readSectionColor(section, "bgColor") ?? surface ?? "#111318";
const sectionAccent = (section: Section, accent?: string | null): string =>
  readSectionColor(section, "accentColor") ?? readSectionColor(section, "primaryColor") ?? accent ?? "#c89f45";
const adapterTextColor = (background: string): string => readableOn("#ffffff", background, { large: false });

const componentText = (component: NonNullable<Section["components"]>[number], key: "label" | "body" | "link_label") =>
  safeText(component[key]);

function legacyButtons(section: Section) {
  return (section.components ?? [])
    .filter((component) => component.kind === "button")
    .map((component) => {
      const href = safeLinkUrl(component.link_url);
      const label = componentText(component, "link_label") ?? componentText(component, "label");
      return href && label ? { href, label } : null;
    })
    .filter((value): value is { href: string; label: string } => Boolean(value));
}

function legacyMedia(section: Section) {
  return (section.components ?? [])
    .filter((component) => (component.kind === "image" || component.kind === "hero_image") && Boolean(component.media_url))
    .map((component) => ({ mediaRef: component.id, alt: componentText(component, "label") ?? "Business image" }));
}

function legacyCards(section: Section) {
  return (section.components ?? [])
    .filter((component) => component.kind === "card")
    .map((component) => ({
      label: componentText(component, "label"),
      body: componentText(component, "body"),
      href: safeLinkUrl(component.link_url),
      hrefLabel: componentText(component, "link_label"),
      mediaRef: component.media_url ? component.id : null,
      alt: componentText(component, "label") ?? "Business image",
    }));
}

/**
 * Converts an older section record into a modern CompositionTree in-memory.
 * This is a migration adapter, not a second design engine: it preserves only
 * content/media/links already present on the section and gives them a modern,
 * responsive composition wrapper so CompositionRenderer remains the only
 * public layout renderer.
 */
export function legacySectionToComposition(section: Section, options: CompositionAdapterOptions = {}): CompositionTree | null {
  if (!LEGACY_SECTION_KINDS.has(section.kind)) return null;
  const background = sectionBackground(section, options.surface);
  const accent = sectionAccent(section, options.accent);
  const foreground = adapterTextColor(background);
  const heading = safeText(section.heading);
  const subheading = safeText(section.subheading);
  const body = safeText(section.body);
  const buttons = legacyButtons(section);
  const media = legacyMedia(section);
  const cards = legacyCards(section);
  const nodes: CompositionNode[] = [];

  if (heading) nodes.push({
    type: "heading", text: heading, level: options.lead ? 1 : 2,
    style: { size: options.lead ? 56 : 42, weight: 700, color: foreground },
    responsive: { tablet: { size: options.lead ? 48 : 36 }, mobile: { size: options.lead ? 38 : 32 } },
  });
  if (subheading) nodes.push({
    type: "text", text: subheading, style: { size: options.lead ? 21 : 18, color: foreground },
    responsive: { mobile: { size: 17 } },
  });
  if (body) nodes.push({
    type: "text", text: body, style: { size: 16, color: foreground, lineHeight: 1.65, maxWidth: 820 },
    responsive: { mobile: { size: 16 } },
  });

  if (section.kind === "hero" && media.length) {
    nodes.push({
      type: "grid", style: { columns: 2, gap: 40, paddingY: 8 },
      responsive: { tablet: { columns: 2, gap: 28 }, mobile: { columns: 1, gap: 24 } },
      children: [
        { type: "stack", style: { gap: 16, items: "center" }, children: nodes.splice(0) },
        { type: "media", mediaRef: media[0]!.mediaRef, alt: media[0]!.alt, style: { aspect: "4:3", radius: 24, objectFit: "cover" } },
      ],
    });
  } else if (cards.length) {
    nodes.push({
      type: "grid",
      style: { columns: Math.min(3, Math.max(1, cards.length)), gap: 20, paddingY: 8 },
      responsive: { tablet: { columns: Math.min(2, Math.max(1, cards.length)), gap: 16 }, mobile: { columns: 1, gap: 14 } },
      children: cards.map((card) => ({
        type: "card" as const,
        style: { background: background === "#111318" ? "#171a20" : background, color: foreground, radius: 20, padding: 24, borderWidth: 1, borderColor: accent },
        children: [
          ...(card.mediaRef ? [{ type: "media" as const, mediaRef: card.mediaRef, alt: card.alt, style: { aspect: "16:10", radius: 14, objectFit: "cover" as const } }] : []),
          ...(card.label ? [{ type: "heading" as const, text: card.label, level: 3 as const, style: { size: 20, weight: 700, color: foreground } }] : []),
          ...(card.body ? [{ type: "text" as const, text: card.body, style: { size: 15, color: foreground, lineHeight: 1.6 } }] : []),
          ...(card.href && card.hrefLabel ? [{ type: "link" as const, text: card.hrefLabel, href: card.href, style: { color: accent, size: 15, weight: 700, minHeight: 44, paddingY: 10, paddingX: 8 } }] : []),
        ],
      })),
    });
  } else if (media.length) {
    nodes.push({
      type: "gallery", style: { columns: Math.min(4, media.length), gap: 16, paddingY: 8 },
      responsive: { tablet: { columns: 2 }, mobile: { columns: 1, gap: 12 } },
      children: media.map((item) => ({ type: "media" as const, mediaRef: item.mediaRef, alt: item.alt, style: { aspect: "4:3", radius: 18, objectFit: "cover" as const } })),
    });
  }

  if (buttons.length) nodes.push({
    type: "row", style: { gap: 12, items: "center", paddingY: 8 }, responsive: { mobile: { gap: 10 } },
    children: buttons.slice(0, 3).map((button, index) => ({
      type: "button" as const, text: button.label, href: button.href,
      style: { background: index === 0 ? accent : background, color: readableOn("#ffffff", index === 0 ? accent : background, { large: false }), size: 15, weight: 700, radius: 999, minHeight: 44, paddingX: 22, paddingY: 13 },
      responsive: { mobile: { size: 15, paddingX: 18, paddingY: 12 } },
    })),
  });

  if (!nodes.length) return null;
  return {
    version: 1,
    label: "legacy-section-modernized",
    root: {
      type: "stack", children: nodes,
      style: { background, color: foreground, paddingY: options.lead ? 72 : 60, paddingX: 24, gap: section.kind === "hero" ? 24 : 28, maxWidth: 1280 },
      responsive: { tablet: { paddingY: options.lead ? 64 : 52, paddingX: 20 }, mobile: { paddingY: options.lead ? 52 : 44, paddingX: 18, gap: 20 } },
    },
  };
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

/**
 * True when a stored section is complete enough to render. While the worker is
 * still writing a page, the draft preview can read a section row before its
 * kind or child arrays are in place (Sentry JAVASCRIPT-REACT-2/3/5/6). Such a
 * row is drawn as a shimmer placeholder instead of crashing the whole draft.
 */
export function isRenderableSection(section: unknown): section is Section {
  if (!section || typeof section !== "object") return false;
  const row = section as { id?: unknown; kind?: unknown; components?: unknown };
  if (typeof row.id !== "string" || !row.id) return false;
  if (typeof row.kind !== "string" || !row.kind) return false;
  if (row.components != null && !Array.isArray(row.components)) return false;
  return true;
}

/**
 * Normalises a section that passed `isRenderableSection` so nested readers
 * never see `undefined` where they expect an array or object.
 */
export function normalizeSection(section: Section): Section {
  const components = Array.isArray(section.components)
    ? section.components.filter((c): c is NonNullable<typeof c> => !!c && typeof c === "object")
    : [];
  return {
    ...section,
    settings: section.settings ?? {},
    components,
  } as Section;
}
