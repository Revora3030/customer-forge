/**
 * Video-bar scorer, part 1: the site model and its features.
 *
 * Turns what a build actually produced (sections with AI layouts, components, the theme) into a flat, comparable
 * set of features the criteria read. Pure: no database, no network, no model. A real site arrives through
 * `siteModelFromSnapshot`, which reads the same `FullSnapshot` the editor and restore points already use.
 */
import type { CompositionNode } from "@/lib/builder/composition-tree";
import type { FullSnapshot } from "@/lib/site-restore";

export type SiteTheme = {
  /** Font families the site loads. The first one is the display family. */
  fonts?: readonly string[];
  /** Base, surface, accent, onAccent, text, muted as `#RRGGBB`. Any can be missing. */
  palette?: Partial<Record<"base" | "surface" | "accent" | "onAccent" | "text" | "muted", string>>;
};

export type ModelComponent = {
  kind: string;
  label?: string | null;
  body?: string | null;
  linkLabel?: string | null;
  linkUrl?: string | null;
  mediaUrl?: string | null;
};

export type ModelSection = {
  id: string;
  pageSlug: string;
  kind: string;
  heading?: string | null;
  subheading?: string | null;
  body?: string | null;
  /** The AI layout, when the section has one (`settings.composition.root`). */
  composition?: CompositionNode | null;
  /** Section-level background image or block styling, as stored in `settings`. */
  bgImage?: string | null;
  components?: readonly ModelComponent[];
};

export type SiteModel = {
  /** In page order, home page first, then section order inside each page. */
  sections: readonly ModelSection[];
  theme?: SiteTheme;
};

const HOME_SLUGS = new Set(["", "/", "home", "index"]);

const rec = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Reads the stored composition tree off a section's settings. Anything that is not a node tree is ignored. */
export function compositionFromSettings(settings: unknown): CompositionNode | null {
  const root = rec(rec(settings)["composition"])["root"];
  return root && typeof root === "object" && typeof (root as { type?: unknown }).type === "string" ? (root as CompositionNode) : null;
}

/** Builds the model from a stored website snapshot. Hidden pages and sections are not part of the site. */
export function siteModelFromSnapshot(snapshot: FullSnapshot, theme?: SiteTheme): SiteModel {
  const pages = snapshot.pages.filter((p) => p.is_visible).slice().sort((a, b) => a.sort_order - b.sort_order);
  const home = pages.findIndex((p) => HOME_SLUGS.has(p.slug.trim().toLowerCase()));
  const ordered = home > 0 ? [pages[home]!, ...pages.filter((_, i) => i !== home)] : pages;
  const sections: ModelSection[] = [];
  for (const page of ordered) {
    for (const section of page.sections.filter((s) => s.is_visible).slice().sort((a, b) => a.sort_order - b.sort_order)) {
      const settings = rec(section.settings);
      const bg = settings["bgImage"] ?? rec(settings["style"])["bgImage"];
      sections.push({
        id: section.id,
        pageSlug: page.slug.trim().toLowerCase() || "home",
        kind: section.kind,
        heading: section.heading,
        subheading: section.subheading,
        body: section.body,
        composition: compositionFromSettings(section.settings),
        bgImage: typeof bg === "string" ? bg : null,
        components: section.components
          .filter((c) => c.is_visible)
          .map((c) => ({ kind: c.kind, label: c.label, body: c.body, linkLabel: c.link_label, linkUrl: c.link_url, mediaUrl: c.media_url })),
      });
    }
  }
  return { sections, ...(theme ? { theme } : {}) };
}

export type FlatNode = { node: CompositionNode; sectionId: string; depth: number; insideChapters: boolean };

/** Every node of a layout, children and tab panels included, depth first. */
export function walkNodes(root: CompositionNode | null | undefined, sectionId: string): FlatNode[] {
  const out: FlatNode[] = [];
  const visit = (node: CompositionNode, depth: number, insideChapters: boolean) => {
    if (!node || typeof node !== "object" || depth > 14 || out.length > 1500) return;
    out.push({ node, sectionId, depth, insideChapters });
    const inside = insideChapters || node.type === "scroll_chapters";
    for (const child of node.children ?? []) visit(child, depth + 1, inside);
    for (const tab of node.tabs ?? []) for (const child of tab.children ?? []) visit(child, depth + 1, inside);
  };
  if (root) visit(root, 0, false);
  return out;
}

export type MediaRef = { sectionId: string; ref: string; alt: string; nodeSized: boolean; kind: "image" | "video" };

const VIDEO = /\.(mp4|webm|mov|m4v)(\?|#|$)/i;
const isVideo = (ref: string) => VIDEO.test(ref);

export type SiteFeatures = {
  homeId: string[];
  /** Sections of the home page, in order. */
  home: readonly ModelSection[];
  nodes: readonly FlatNode[];
  nodesBySection: ReadonlyMap<string, FlatNode[]>;
  media: readonly MediaRef[];
  /** Every piece of visible text, tagged with the section it sits in. */
  texts: readonly { id: string; text: string }[];
};

/** Collects the features the criteria read. */
export function extractFeatures(site: SiteModel): SiteFeatures {
  const home = (() => {
    const first = site.sections[0];
    if (!first) return [] as ModelSection[];
    const slug = site.sections.some((s) => HOME_SLUGS.has(s.pageSlug)) ? "home" : first.pageSlug;
    return site.sections.filter((s) => (slug === "home" ? HOME_SLUGS.has(s.pageSlug) : s.pageSlug === slug));
  })();
  const nodes: FlatNode[] = [];
  const nodesBySection = new Map<string, FlatNode[]>();
  const media: MediaRef[] = [];
  const texts: { id: string; text: string }[] = [];
  const addText = (id: string, value: unknown) => {
    if (typeof value === "string" && value.trim()) texts.push({ id, text: value });
  };

  for (const section of site.sections) {
    addText(section.id, section.heading);
    addText(section.id, section.subheading);
    addText(section.id, section.body);
    for (const c of section.components ?? []) {
      addText(section.id, c.label);
      addText(section.id, c.body);
      addText(section.id, c.linkLabel);
      if (c.mediaUrl) media.push({ sectionId: section.id, ref: c.mediaUrl, alt: String(c.label ?? ""), nodeSized: true, kind: isVideo(c.mediaUrl) ? "video" : "image" });
    }
    if (section.bgImage) media.push({ sectionId: section.id, ref: section.bgImage, alt: "", nodeSized: true, kind: isVideo(section.bgImage) ? "video" : "image" });

    const flat = walkNodes(section.composition, section.id);
    nodesBySection.set(section.id, flat);
    for (const f of flat) {
      nodes.push(f);
      const n = f.node;
      addText(section.id, n.text);
      for (const item of n.items ?? []) addText(section.id, item);
      for (const q of n.faqItems ?? []) {
        addText(section.id, q.question);
        addText(section.id, q.answer);
      }
      addText(section.id, n.primaryCta?.label);
      addText(section.id, n.secondaryCta?.label);
      for (const tab of n.tabs ?? []) addText(section.id, tab.label);
      for (const o of n.dialOptions ?? []) {
        addText(section.id, o.label);
        addText(section.id, o.note);
      }
      for (const fl of n.floors ?? []) {
        addText(section.id, fl.label);
        addText(section.id, fl.body);
      }
      const sized = typeof n.style?.aspect === "string" || typeof n.style?.minHeight === "number";
      const mediaLike = n.type === "media" || n.type === "scene" || n.type === "parallax_layers";
      const own = n.src ?? n.mediaRef;
      if (mediaLike && own) media.push({ sectionId: section.id, ref: own, alt: n.alt ?? "", nodeSized: sized, kind: isVideo(own) ? "video" : "image" });
      for (const img of [n.beforeImage, n.afterImage]) {
        const ref = img?.src ?? img?.mediaRef;
        if (ref) media.push({ sectionId: section.id, ref, alt: img?.alt ?? "", nodeSized: true, kind: "image" });
      }
      // Hrefs that carry a real contact detail are checked like text.
      for (const href of [n.href, n.primaryCta?.href, n.secondaryCta?.href]) {
        if (typeof href === "string" && /^(tel|mailto):/i.test(href)) addText(section.id, href.replace(/^(tel|mailto):/i, " "));
      }
    }
  }
  return { homeId: home.map((s) => s.id), home, nodes, nodesBySection, media, texts };
}
