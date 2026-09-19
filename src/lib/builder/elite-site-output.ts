/**
 * REVORA ELITE SITE OUTPUT COMPILER
 *
 * Visual intent must survive the complete path:
 * prompt -> plan -> AgentAction -> persisted site state -> public renderer.
 *
 * This compiler creates a deterministic, bounded visual system for generated
 * sites: brand direction, composition, section variants, motion, media
 * treatment, and conversion hierarchy. It never invents business facts and
 * never emits arbitrary CSS.
 */

import type { AgentAction } from "@/lib/site-agent";
import type { AgentContext } from "@/lib/site-agent.server";
import { pickVisualDirection } from "@/lib/visual-direction";
import { recommendDirections } from "@/lib/design-directions";
import { compileVisualComposition } from "./visual-composition";

type Section = AgentContext["pages"][number]["sections"][number];

const VISUAL_REQUEST =
  /\b(build|create|generate|design|redesign|restyle|refresh|polish|premium|beautiful|modern|visual|look|brand|sitewide|entire site|website)\b/i;
const WHOLE_SITE =
  /\b(site[- ]?wide|entire site|whole site|all pages|every page|across the site|from scratch|new website|build me a website)\b/i;
const IMAGE_KINDS = new Set(["image", "gallery", "media", "photo", "hero_image"]);

function stableScore(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function variantFor(section: Section, directionId: string): string {
  const seed = stableScore(directionId + ":" + section.kind) % 4;
  switch (section.kind) {
    case "hero": return ["hero-split", "hero-editorial", "hero-layered", "hero-focus"][seed]!;
    case "services": return ["cards-elevated", "cards-floating", "cards-editorial", "cards-clean"][seed]!;
    case "gallery": return ["gallery-editorial", "gallery-grid", "gallery-mosaic", "gallery-cinematic"][seed]!;
    case "reviews": return ["proof-cards", "proof-editorial", "proof-grid", "proof-feature"][seed]!;
    case "cta":
    case "offer": return ["cta-spotlight", "cta-panel", "cta-fullbleed", "cta-minimal"][seed]!;
    case "contact":
    case "booking":
    case "quote": return ["form-premium", "form-clean", "form-glass", "form-editorial"][seed]!;
    case "faq": return ["faq-clean", "faq-editorial", "faq-compact", "faq-spacious"][seed]!;
    default: return ["section-balanced", "section-editorial", "section-airy", "section-soft"][seed]!;
  }
}

function compositionFor(section: Section, dark: boolean) {
  switch (section.kind) {
    case "hero":
      return {
        layout: "layered" as const,
        density: "airy" as const,
        image_position: "right" as const,
        image_treatment: dark ? ("cinematic" as const) : ("rounded" as const),
        spacing: "generous" as const,
        max_width: "wide" as const,
        card_style: dark ? ("glass" as const) : ("floating" as const),
        image_ratio: "16:9" as const,
      };
    case "services":
    case "benefits":
    case "pricing":
      return {
        layout: "editorial" as const,
        density: "balanced" as const,
        spacing: "generous" as const,
        max_width: "wide" as const,
        card_style: dark ? ("glass" as const) : ("soft" as const),
      };
    case "gallery":
    case "reviews":
      return {
        layout: "editorial" as const,
        density: "airy" as const,
        spacing: "generous" as const,
        max_width: "wide" as const,
        card_style: dark ? ("glass" as const) : ("soft" as const),
        image_ratio: "4:3" as const,
      };
    case "cta":
    case "offer":
      return {
        layout: "full_bleed" as const,
        density: "airy" as const,
        spacing: "generous" as const,
        max_width: "wide" as const,
        card_style: dark ? ("glass" as const) : ("floating" as const),
      };
    default:
      return {
        layout: "centered" as const,
        density: "balanced" as const,
        spacing: "standard" as const,
        max_width: "standard" as const,
        card_style: dark ? ("glass" as const) : ("soft" as const),
      };
  }
}

export type EliteSiteOutputResult = {
  actions: AgentAction[];
  directionId: string | null;
  directionName: string | null;
  visualSystem: string[];
  imageSlots: string[];
};

export function compileEliteSiteOutput(
  context: AgentContext,
  instruction: string,
  cap = 40,
): EliteSiteOutputResult {
  if (!VISUAL_REQUEST.test(instruction) && !WHOLE_SITE.test(instruction)) {
    return { actions: [], directionId: null, directionName: null, visualSystem: [], imageSlots: [] };
  }

  const direction =
    recommendDirections({
      businessName: context.business.name,
      industry: context.business.industry,
      services: context.business.services.map((service) => ({ name: service.name })),
      city: context.business.city,
      count: 1,
    })[0] ??
    pickVisualDirection({
      industry: context.business.industry,
      services: context.business.services.map((service) => ({ name: service.name })),
    });

  const dark = direction.secondary !== "#ffffff" && !/^#f/i.test(direction.secondary);
  const actions: AgentAction[] = [
    {
      type: "set_theme",
      patch: {
        primary_color: direction.primary,
        secondary_color: direction.secondary,
        accent_color: direction.accent,
        font_preference: direction.font,
      },
    },
    { type: "set_backdrop", backdrop: direction.backdrop },
  ];

  const visibleSections = context.pages
    .filter((page) => page.is_visible && !page.noindex)
    .flatMap((page) => page.sections.filter((section) => section.is_visible));
  const targetSections = WHOLE_SITE.test(instruction)
    ? visibleSections.slice(0, 34)
    : visibleSections.slice(0, 12);

  for (const section of targetSections) {
    if (actions.length >= cap) break;
    actions.push({
      type: "set_section_variant",
      sectionId: section.id,
      variant: variantFor(section, direction.id),
    });
    if (actions.length >= cap) break;
    actions.push({
      type: "set_section_visual",
      sectionId: section.id,
      patch: compositionFor(section, dark),
    });
  }

  for (const section of targetSections) {
    for (const component of section.components.filter((item) => IMAGE_KINDS.has(item.kind))) {
      if (actions.length >= cap) break;
      actions.push({
        type: "set_component_visual",
        componentId: component.id,
        patch: {
          alt: component.label?.trim().slice(0, 160) || context.business.name + " image",
          object_fit: "cover",
          overlay: "none",
          radius: "large",
          shadow: dark ? "medium" : "soft",
          aspect_ratio: section.kind === "hero" ? "16:9" : "4:3",
          focal_point: "0.5 0.5",
        },
      });
    }
    if (actions.length >= cap) break;
  }

  const composition = compileVisualComposition(
    context,
    instruction,
    [],
    WHOLE_SITE.test(instruction) ? 2 : 1,
    Math.max(0, cap - actions.length),
  );
  for (const action of composition) {
    if (actions.length >= cap) break;
    actions.push(action);
  }

  return {
    actions: actions.slice(0, cap),
    directionId: direction.id,
    directionName: direction.name,
    visualSystem: [
      "Palette: " + direction.primary + " / " + direction.secondary + " / " + direction.accent,
      "Typography: " + direction.font,
      "Backdrop: " + direction.backdrop,
      "Hero motion: " + direction.heroEffect,
      "Responsive composition: mobile-safe section primitives",
      "Media treatment: validated image tokens only",
    ],
    imageSlots: context.business.services.slice(0, 6).map((service) => service.name),
  };
}
