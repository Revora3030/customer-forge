/**
 * Upgrades a section saved before every section carried an AI composition.
 *
 * Older sites (and sections left behind by an interrupted build) store only
 * plain fields: heading, subheading, body, and child components (images,
 * buttons, cards). They used to render through a separate hard-coded
 * template switch in SiteSections.tsx, so those sites looked like a different
 * product from AI-composed ones.
 *
 * This adapter converts those fields into a CompositionTree so EVERY content
 * section renders through CompositionRenderer — the same responsive grid,
 * fluid type, readability guard, phone safety and 44px tap targets. It is a
 * faithful translation, not a new design: it uses only the words, pictures and
 * links already saved on the section, invents no copy and no facts, and takes
 * its colours from the site's theme tokens (it sets no colours of its own).
 * The AI team still replaces it with a bespoke composition on the next
 * redesign.
 */
import { MODEL_COMPONENT_KIND } from "@/lib/site-models";
import type { CompositionNode, CompositionTree } from "@/lib/builder/composition-tree";
import { isSafeHref } from "@/lib/builder/composition-tree";
import { safeParagraph, safeText } from "@/lib/builder/presentation";
import { safeLinkUrl } from "@/lib/website-content";
import { pickVariant, type SectionVariantGroup } from "@/lib/builder/section-variants";

/** Section kinds that used the old fixed template branch. */
export const LEGACY_CONTENT_KINDS: ReadonlySet<string> = new Set([
  "hero",
  "services",
  "process",
  "social_proof",
  "faq",
  "home",
  "page",
  "story",
  "values",
  "service_area",
]);

export type LegacyComponent = {
  id: string;
  kind: string;
  label?: string | null;
  body?: string | null;
  url?: string | null;
  link_url?: string | null;
  link_label?: string | null;
};

export type LegacySection = {
  id: string;
  kind: string;
  heading?: string | null;
  subheading?: string | null;
  body?: string | null;
  components?: LegacyComponent[] | null;
};

const SAFE_REF = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|temp_[a-z0-9_]{1,30})$/i;

function media(component: LegacyComponent, alt: string, aspect: string, radius: number): CompositionNode | null {
  if (!component.url) return null;
  // Renderer resolves the component's own (signed) URL through its media map.
  if (!SAFE_REF.test(component.id)) return null;
  // The owner's uploaded 3D model gets its viewer, never an <img>.
  if (component.kind === MODEL_COMPONENT_KIND)
    return { type: "model_3d_viewer", mediaRef: component.id, text: (safeText(component.label) ?? "").slice(0, 60) || "Turn it around", alt: alt || "3D model", style: { radius } };
  return {
    type: "media",
    mediaRef: component.id,
    alt,
    style: { aspect, radius, objectFit: "cover" },
  };
}

function action(component: LegacyComponent, primary: boolean): CompositionNode | null {
  const href = safeLinkUrl(component.link_url);
  if (!href || !isSafeHref(href)) return null;
  const label = safeText(component.link_label) || safeText(component.label);
  if (!label) return null;
  return {
    type: "button",
    text: label,
    href,
    // A neutral currentColor outline only, so the primary action reads as a
    // button rather than a word; no fill colour, size or label is chosen.
    style: primary
      ? { paddingX: 24, paddingY: 14, radius: 999, weight: 600, size: 15, borderWidth: 2 }
      : { paddingX: 24, paddingY: 14, radius: 999, weight: 600, size: 15, borderWidth: 1 },
  };
}

/**
 * Kinds that are not in LEGACY_CONTENT_KINDS (so plan checks and the renderable
 * list are unchanged) but are still drawn by the adapter when an older section
 * of that kind carries its own saved words or links.
 */
const VARIANT_ONLY_KINDS: ReadonlySet<string> = new Set(["cta"]);

export type LegacyCompositionOptions = {
  lead?: boolean;
  /**
   * Stable seed (the site's slug) for choosing among the layout variants of a
   * section type. Without it the original default layout is always used.
   */
  seed?: string | null;
};

type Copy = { heading: string | null; subheading: string | null; body: string | null; buttons: CompositionNode[]; level: 1 | 2; hero: boolean };

/** Heading, subheading, body and buttons as separate nodes so layouts can place them. */
function copyNodes(copy: Copy, extra: { align?: "left" | "center"; headingSize?: number } = {}): { heading: CompositionNode[]; text: CompositionNode[]; actions: CompositionNode[] } {
  const align = extra.align ? { align: extra.align } : {};
  const heading: CompositionNode[] = [];
  const text: CompositionNode[] = [];
  if (copy.heading) {
    heading.push({
      type: "heading",
      level: copy.level,
      text: copy.heading,
      style: copy.hero
        ? { size: extra.headingSize ?? 64, weight: 650, lineHeight: 1.04, letterSpacing: -0.02, ...align }
        : { size: extra.headingSize ?? 42, weight: 650, lineHeight: 1.1, letterSpacing: -0.01, ...align },
    });
  }
  if (copy.subheading) heading.push({ type: "text", text: copy.subheading, style: { size: copy.hero ? 20 : 18, lineHeight: 1.55, opacity: 82, maxWidth: 640, ...align } });
  if (copy.body) text.push({ type: "text", text: copy.body, style: { size: 16, lineHeight: 1.65, opacity: 78, maxWidth: 640, ...align } });
  const actions: CompositionNode[] = copy.buttons.length
    ? [{ type: "row", style: { gap: 12, ...(extra.align === "center" ? { justify: "center" as const } : {}) }, children: copy.buttons }]
    : [];
  return { heading, text, actions };
}

const stackOf = (children: CompositionNode[], gap = 18, extra: NonNullable<CompositionNode["style"]> = {}): CompositionNode => ({
  type: "stack",
  style: { gap, ...extra },
  children,
});

/** Which variant group a section's content belongs to. */
function groupFor(kind: string, hasCards: boolean, isHero: boolean): SectionVariantGroup {
  if (kind === "cta") return "cta";
  if (hasCards) return kind === "social_proof" ? "proof" : "cards";
  return isHero ? "hero" : "about";
}

/**
 * Returns a composition tree for an older plain section, or null when the
 * section has nothing real to show (it then renders nothing, as before).
 *
 * Every layout variant draws the same saved words, pictures and links and
 * nothing else: no invented copy, ratings or reviews, and no colours (the site
 * theme decides). The variant is chosen deterministically from options.seed
 * and the section id; variant 0 is the original layout and the fallback.
 */
export function legacySectionToComposition(section: LegacySection, options: LegacyCompositionOptions = {}): CompositionTree | null {
  const variantOnly = VARIANT_ONLY_KINDS.has(section.kind);
  if (!LEGACY_CONTENT_KINDS.has(section.kind) && !variantOnly) return null;
  const components = (section.components ?? []).filter(Boolean);
  const heading = safeText(section.heading);
  const subheading = safeText(section.subheading);
  const body = safeParagraph(section.body);
  const images = components.filter((c) => (c.kind === "image" || c.kind === "hero_image") && c.url);
  const buttons = components
    .filter((c) => c.kind === "button")
    .slice(0, 2)
    .map((c, index) => action(c, index === 0))
    .filter((node): node is CompositionNode => node !== null);
  const cards = components.filter((c) => c.kind === "card" && (safeText(c.label) || safeText(c.body)));
  const models = components.filter((c) => c.kind === MODEL_COMPONENT_KIND && c.url);
  if (variantOnly) {
    // A plain call-to-action needs its own words or at least one working link.
    if (!heading && !subheading && !body && !buttons.length) return null;
  } else if (!heading && !subheading && !body && !cards.length && !images.length && !models.length) return null;

  const isHero = section.kind === "hero" || options.lead === true;
  const group = groupFor(section.kind, cards.length > 0, isHero);
  const variant = pickVariant(group, section.id, options.seed);
  const copy: Copy = { heading, subheading, body, buttons, level: options.lead ? 1 : 2, hero: isHero };
  const lead = images[0] ? media(images[0], safeText(images[0].label) ?? heading ?? "", "4:3", 24) : null;
  const wide = (image: LegacyComponent | undefined, aspect: string): CompositionNode | null =>
    image ? media(image, safeText(image.label) ?? heading ?? "", aspect, 24) : null;

  const blocks: CompositionNode[] = [];

  if (group === "cta") {
    const parts = copyNodes({ ...copy, hero: false }, { align: variant === 1 ? "left" : "center", headingSize: variant === 2 ? 52 : 38 });
    if (variant === 1) {
      // Split: words on the left, the action on the right (stacks on phones).
      blocks.push({
        type: "card",
        style: { padding: 40, radius: 24, gap: 24, borderWidth: 1 },
        responsive: { mobile: { padding: 24 } },
        children: [{
          type: "grid",
          style: { columns: 2, gap: 32, items: "center" },
          responsive: { mobile: { columns: 1, gap: 20 } },
          children: [stackOf([...parts.heading, ...parts.text], 14), ...parts.actions],
        }],
      });
    } else if (variant === 2) {
      // Plain statement: a large centred line and the actions, no panel.
      blocks.push(stackOf([...parts.heading, ...parts.text, ...parts.actions], 22, { align: "center", items: "center" }));
    } else {
      // Default: a centred bordered panel.
      blocks.push({
        type: "card",
        style: { padding: 48, radius: 28, gap: 18, align: "center", items: "center", borderWidth: 1 },
        responsive: { mobile: { padding: 28 } },
        children: [...parts.heading, ...parts.text, ...parts.actions],
      });
    }
  } else if (!cards.length) {
    // Opening / story layouts.
    if (group === "hero" && variant === 1) {
      // Centred headline and actions, the picture wide beneath.
      const parts = copyNodes(copy, { align: "center" });
      blocks.push(stackOf([...parts.heading, ...parts.text, ...parts.actions], 18, { align: "center", items: "center" }));
      const picture = wide(images[0], "16:9");
      if (picture) blocks.push(picture);
    } else if (group === "hero" && variant === 2) {
      // Statement: an oversized left-aligned headline, the picture wide beneath.
      const parts = copyNodes(copy, { headingSize: 76 });
      blocks.push(stackOf([...parts.heading, ...parts.text, ...parts.actions], 20));
      const picture = wide(images[0], "21:9");
      if (picture) blocks.push(picture);
    } else if (group === "about" && variant === 1) {
      // Editorial: the heading in one column, the story and actions in the other.
      const parts = copyNodes(copy);
      if (parts.text.length || parts.actions.length) {
        blocks.push({
          type: "grid",
          style: { columns: 2, gap: 56, items: "start" },
          responsive: { mobile: { columns: 1, gap: 24 } },
          children: [stackOf(parts.heading, 14), stackOf([...parts.text, ...parts.actions], 18)],
        });
      } else {
        blocks.push(stackOf(parts.heading, 14));
      }
      const picture = wide(images[0], "16:9");
      if (picture) blocks.push(picture);
    } else if (group === "about" && variant === 2) {
      const parts = copyNodes(copy, { align: lead ? "left" : "center" });
      const words = stackOf([...parts.heading, ...parts.text, ...parts.actions], 18, lead ? {} : { align: "center", items: "center", maxWidth: 760 });
      // Picture first beside the words, or a narrow centred column without one.
      blocks.push(lead
        ? { type: "grid", style: { columns: 2, gap: 48, items: "center" }, responsive: { mobile: { columns: 1, gap: 28 } }, children: [lead, words] }
        : words);
    } else {
      // Default (variant 0): the original layout.
      const parts = copyNodes(copy);
      const copyStack = stackOf([...parts.heading, ...parts.text, ...parts.actions]);
      blocks.push(lead
        ? { type: "grid", style: { columns: 2, gap: 48, items: "center" }, responsive: { mobile: { columns: 1, gap: 28 } }, children: [copyStack, lead] }
        : copyStack);
    }
  } else {
    const parts = copyNodes(copy);
    blocks.push(stackOf([...parts.heading, ...parts.text, ...parts.actions]));
  }

  if (cards.length) {
    const cardBody = (card: LegacyComponent, size = 15): { picture: CompositionNode | null; label: string | null; text: string | null; link: CompositionNode | null } => {
      const label = safeText(card.label);
      const text = safeText(card.body);
      const href = safeLinkUrl(card.link_url);
      const picture = card.url ? media(card, label ?? "", "16:10", 16) : null;
      const link = href && isSafeHref(href)
        ? ({ type: "link", text: safeText(card.link_label) || label || "Details", href, style: { weight: 600, size } } as CompositionNode)
        : null;
      return { picture, label, text, link };
    };
    const cardNode = (card: LegacyComponent, spec: { padding: number; headingSize: number; textSize: number; span?: number; textFirst?: boolean; align?: "left" | "center" }): CompositionNode => {
      const { picture, label, text, link } = cardBody(card, spec.textSize);
      const alignStyle = spec.align ? { align: spec.align } : {};
      const labelNode: CompositionNode | null = label ? { type: "heading", level: 3, text: label, style: { size: spec.headingSize, weight: 600, lineHeight: 1.25, ...alignStyle } } : null;
      const textNode: CompositionNode | null = text ? { type: "text", text, style: { size: spec.textSize, lineHeight: 1.6, opacity: 80, ...alignStyle } } : null;
      const inner: CompositionNode[] = [];
      if (picture) inner.push(picture);
      // A quote reads before the name of the person who gave it.
      for (const node of spec.textFirst ? [textNode, labelNode] : [labelNode, textNode]) if (node) inner.push(node);
      if (link) inner.push(link);
      return {
        type: "card",
        style: { padding: spec.padding, radius: 20, gap: 12, ...(spec.span ? { span: spec.span } : {}) },
        responsive: { mobile: { span: 1, padding: Math.min(spec.padding, 20) } },
        children: inner,
      };
    };

    if (group === "proof" && variant === 1) {
      // Quote stack: one narrow, centred column, the words first.
      blocks.push({
        type: "grid",
        style: { columns: 1, gap: 20, maxWidth: 760 },
        children: cards.map((card) => cardNode(card, { padding: 32, headingSize: 17, textSize: 20, textFirst: true, align: "center" })),
      });
    } else if (group === "proof" && variant === 2) {
      // Featured: the first entry wide, the rest in two columns.
      blocks.push({
        type: "grid",
        style: { columns: 2, gap: 20 },
        responsive: { mobile: { columns: 1, gap: 16 } },
        children: cards.map((card, index) => cardNode(card, index === 0
          ? { padding: 36, headingSize: 18, textSize: 20, textFirst: true, span: 2 }
          : { padding: 24, headingSize: 16, textSize: 15, textFirst: true })),
      });
    } else if (group === "proof") {
      blocks.push({
        type: "grid",
        style: { columns: cards.length >= 3 ? 3 : 2, gap: 20 },
        responsive: { tablet: { columns: 2 }, mobile: { columns: 1, gap: 16 } },
        children: cards.map((card, index) => cardNode(card, { padding: 24, headingSize: 20, textSize: 15, ...(cards.length >= 3 && index === 0 ? { span: 2 } : {}) })),
      });
    } else if (variant === 1) {
      // Rows: the name on the left, the description beside it, one line per item.
      blocks.push({
        type: "grid",
        style: { columns: 1, gap: 14 },
        children: cards.map((card) => {
          const { picture, label, text, link } = cardBody(card);
          const side: CompositionNode[] = [];
          if (text) side.push({ type: "text", text, style: { size: 15, lineHeight: 1.6, opacity: 80 } });
          if (link) side.push(link);
          const cells: CompositionNode[] = [];
          cells.push(label
            ? { type: "heading", level: 3, text: label, style: { size: 22, weight: 600, lineHeight: 1.25 } }
            : stackOf([], 0));
          cells.push(stackOf(side, 10));
          return {
            type: "card",
            style: { padding: 24, radius: 16, gap: 16 },
            responsive: { mobile: { padding: 18 } },
            children: [
              ...(picture ? [picture] : []),
              { type: "grid", style: { columns: 2, gap: 32, items: "start" }, responsive: { mobile: { columns: 1, gap: 8 } }, children: cells } as CompositionNode,
            ],
          } as CompositionNode;
        }),
      });
    } else if (variant === 2) {
      // Two large cards across.
      blocks.push({
        type: "grid",
        style: { columns: 2, gap: 24 },
        responsive: { mobile: { columns: 1, gap: 16 } },
        children: cards.map((card) => cardNode(card, { padding: 32, headingSize: 24, textSize: 16 })),
      });
    } else {
      // Default: bento-style card grid, the first card spans wider when there are 3+.
      blocks.push({
        type: "grid",
        style: { columns: cards.length >= 3 ? 3 : 2, gap: 20 },
        responsive: { tablet: { columns: 2 }, mobile: { columns: 1, gap: 16 } },
        children: cards.map((card, index) => cardNode(card, { padding: 24, headingSize: 20, textSize: 15, ...(cards.length >= 3 && index === 0 ? { span: 2 } : {}) })),
      });
    }
    const gallery = images
      .slice(0, 4)
      .map((image) => media(image, safeText(image.label) ?? "", "4:3", 16))
      .filter((node): node is CompositionNode => node !== null);
    if (gallery.length) {
      blocks.push({
        type: "grid",
        style: { columns: 2, gap: 16 },
        responsive: { mobile: { columns: 1 } },
        children: gallery,
      });
    }
  }

  // The owner's uploaded 3D models, each in its own viewer.
  for (const model of models.slice(0, 2)) {
    const viewer = media(model, safeText(model.label) ?? heading ?? "3D model", "4:3", 24);
    if (viewer) blocks.push(viewer);
  }

  return {
    version: 1,
    label: `upgraded-${section.kind}`,
    root: {
      type: "stack",
      style: { maxWidth: 1152, paddingX: 24, paddingY: isHero ? 96 : 72, gap: 48 },
      responsive: { mobile: { paddingX: 16, paddingY: isHero ? 56 : 48, gap: 32 } },
      children: blocks,
    },
  };
}
