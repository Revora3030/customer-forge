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
import type { CompositionNode, CompositionTree } from "@/lib/builder/composition-tree";
import { isSafeHref } from "@/lib/builder/composition-tree";
import { safeParagraph, safeText } from "@/lib/builder/presentation";
import { safeLinkUrl } from "@/lib/website-content";

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
    style: primary
      ? { paddingX: 24, paddingY: 14, radius: 999, weight: 600, size: 15 }
      : { paddingX: 24, paddingY: 14, radius: 999, weight: 600, size: 15, borderWidth: 1 },
  };
}

/**
 * Returns a composition tree for an older plain section, or null when the
 * section has nothing real to show (it then renders nothing, as before).
 */
export function legacySectionToComposition(section: LegacySection, options: { lead?: boolean } = {}): CompositionTree | null {
  if (!LEGACY_CONTENT_KINDS.has(section.kind)) return null;
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
  if (!heading && !subheading && !body && !cards.length && !images.length) return null;

  const isHero = section.kind === "hero" || options.lead === true;
  const copy: CompositionNode[] = [];
  if (heading) {
    copy.push({
      type: "heading",
      level: options.lead ? 1 : 2,
      text: heading,
      style: isHero
        ? { size: 64, weight: 650, lineHeight: 1.04, letterSpacing: -0.02 }
        : { size: 42, weight: 650, lineHeight: 1.1, letterSpacing: -0.01 },
    });
  }
  if (subheading) copy.push({ type: "text", text: subheading, style: { size: isHero ? 20 : 18, lineHeight: 1.55, opacity: 82, maxWidth: 640 } });
  if (body) copy.push({ type: "text", text: body, style: { size: 16, lineHeight: 1.65, opacity: 78, maxWidth: 640 } });
  if (buttons.length) copy.push({ type: "row", style: { gap: 12 }, children: buttons });

  const copyStack: CompositionNode = { type: "stack", style: { gap: 18 }, children: copy };
  const lead = images[0] ? media(images[0], safeText(images[0].label) ?? heading ?? "", isHero ? "4:3" : "4:3", 24) : null;

  const blocks: CompositionNode[] = [];
  // Opening split: copy beside the first picture (stacks on phones).
  if (lead && !cards.length) {
    blocks.push({
      type: "grid",
      style: { columns: 2, gap: 48, items: "center" },
      responsive: { mobile: { columns: 1, gap: 28 } },
      children: [copyStack, lead],
    });
  } else {
    blocks.push(copyStack);
  }

  if (cards.length) {
    // Bento-style card grid: the first card spans wider when there are 3+.
    const cardNodes: CompositionNode[] = cards.map((card, index) => {
      const label = safeText(card.label);
      const cardBody = safeText(card.body);
      const href = safeLinkUrl(card.link_url);
      const picture = card.url ? media(card, label ?? "", "16:10", 16) : null;
      const inner: CompositionNode[] = [];
      if (picture) inner.push(picture);
      if (label) inner.push({ type: "heading", level: 3, text: label, style: { size: 20, weight: 600, lineHeight: 1.25 } });
      if (cardBody) inner.push({ type: "text", text: cardBody, style: { size: 15, lineHeight: 1.6, opacity: 80 } });
      if (href && isSafeHref(href)) {
        inner.push({ type: "link", text: safeText(card.link_label) || label || "Details", href, style: { weight: 600, size: 15 } });
      }
      return {
        type: "card",
        style: { padding: 24, radius: 20, gap: 12, ...(cards.length >= 3 && index === 0 ? { span: 2 } : {}) },
        responsive: { mobile: { span: 1, padding: 20 } },
        children: inner,
      };
    });
    blocks.push({
      type: "grid",
      style: { columns: cards.length >= 3 ? 3 : 2, gap: 20 },
      responsive: { tablet: { columns: 2 }, mobile: { columns: 1, gap: 16 } },
      children: cardNodes,
    });
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
