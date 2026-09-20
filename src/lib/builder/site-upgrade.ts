/**
 * Whole-site upgrade planner.
 *
 * Composes existing pieces (design directions, effect ids, real business facts)
 * into a single bounded plan of AgentActions that lifts a whole workspace
 * closer to designer-grade output in one pass:
 *
 *   1. Pick a designer direction that fits this business (industry + name),
 *      then emit the theme, backdrop and per-section effect actions that
 *      install it site-wide.
 *   2. Rewrite empty or template-default hero copy from real facts only —
 *      never overwrite an owner-authored line.
 *   3. Add high-value sections the home page is missing (proof, FAQ, CTA)
 *      when the section kind is allowed and not already present.
 *   4. Reorder the home page into the proven conversion sequence when the
 *      current order deviates.
 *
 * Everything is expressed as existing AgentActions so the current apply /
 * verify / rollback pipeline keeps guarding the changes. The planner is pure
 * and cheap — it does not call any external service.
 */

import type { AgentAction, AgentContext } from "@/lib/site-agent.server";
import type { BuilderIntent } from "@/lib/builder/interpreter";
import { recommendDirections } from "@/lib/design-directions";

/** Section kinds that should never appear twice on the same page. */
const HIGH_VALUE_SECTIONS = ["reviews", "faq", "cta", "contact"] as const;

/** The proven conversion order for a home page's sections. */
const CONVERSION_ORDER = [
  "hero",
  "trust_bar",
  "intro",
  "services",
  "features",
  "benefits",
  "process",
  "gallery",
  "portfolio",
  "reviews",
  "pricing",
  "faq",
  "cta",
  "contact",
  "booking",
  "quote",
];

/**
 * Headings that clearly weren't written by the owner and are safe to replace.
 * A line the owner actually wrote (however plain) is preserved.
 */
const TEMPLATE_HEADING = new RegExp(
  [
    "^welcome( to)?$",
    "^welcome to your (site|website|business)",
    "^your (business|company|site|website)( name)?$",
    "^our (site|website)$",
    "^home$",
    "^hero$",
    "^headline$",
    "^placeholder",
    "^coming soon",
    "^untitled",
    "^lorem ipsum",
  ].join("|"),
  "i",
);

function looksTemplated(value: string | null | undefined): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  if (trimmed.length < 3) return true;
  return TEMPLATE_HEADING.test(trimmed);
}

function primaryService(context: AgentContext): string | null {
  const first = context.business.services.find((service) => service.name?.trim().length > 0);
  return first ? first.name.trim() : null;
}

function locationPhrase(context: AgentContext): string | null {
  const city = context.business.city?.trim();
  const area = context.business.serviceArea?.trim();
  if (city && city.length > 1) return city;
  if (area && area.length > 1) return area;
  return null;
}

/**
 * Build a factual headline from what the workspace actually knows about the
 * business. Returns null when there isn't enough real information to say
 * anything specific — we omit rather than invent.
 */
export function factualHeadline(context: AgentContext): string | null {
  const name = context.business.name?.trim();
  const tagline = context.business.tagline?.trim();
  const service = primaryService(context);
  const location = locationPhrase(context);

  if (tagline && tagline.length >= 6 && tagline.length <= 90) return tagline;

  if (name && service && location) return `${service} in ${location} — ${name}`;
  if (name && service) return `${name} — ${service}`;
  if (service && location) return `${service} in ${location}`;
  if (name && location) return `${name} — serving ${location}`;
  if (name) return name;
  return null;
}

/**
 * Build a factual subheading from what's known. Same rule: omit when there
 * isn't enough real information.
 */
export function factualSubheading(context: AgentContext): string | null {
  const description = context.business.description?.trim();
  if (description && description.length >= 24 && description.length <= 220) return description;

  const location = locationPhrase(context);
  const service = primaryService(context);
  if (service && location) return `Trusted ${service.toLowerCase()} for customers across ${location}.`;
  if (location) return `Serving customers across ${location}.`;
  return null;
}

function sectionEffectFor(
  kind: string,
  direction: { heroEffect: string; ctaEffect: string; formEffect: string; bodyEffect: string },
): string {
  switch (kind) {
    case "hero":
      return direction.heroEffect;
    case "cta":
    case "sticky_cta":
    case "offer":
      return direction.ctaEffect;
    case "contact":
    case "booking":
    case "quote":
      return direction.formEffect;
    default:
      return direction.bodyEffect;
  }
}

function homePage(context: AgentContext) {
  return (
    context.pages.find((page) => page.kind === "home" && page.is_visible) ??
    context.pages.find((page) => page.is_visible) ??
    null
  );
}

function pageHasSection(page: { sections: { kind: string; is_visible: boolean }[] }, kind: string) {
  return page.sections.some((section) => section.is_visible && section.kind === kind);
}

/**
 * Only reorder when the current sequence actually differs from the ideal one
 * — a small page (fewer than four sections) already reads in whatever order
 * feels right, so leave it alone.
 */
function needsReorder(sectionIds: string[], desiredIds: string[]): boolean {
  if (sectionIds.length < 4) return false;
  if (sectionIds.length !== desiredIds.length) return true;
  for (let i = 0; i < sectionIds.length; i += 1) {
    if (sectionIds[i] !== desiredIds[i]) return true;
  }
  return false;
}

/** Sort visible sections into the conversion order, keeping unknown kinds at the end in original order. */
function conversionOrderedIds(page: { sections: { id: string; kind: string; is_visible: boolean; sort_order: number }[] }) {
  const visible = page.sections
    .filter((section) => section.is_visible)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
  const ranked = visible
    .map((section, originalIndex) => {
      const rank = CONVERSION_ORDER.indexOf(section.kind);
      return { section, rank: rank >= 0 ? rank : CONVERSION_ORDER.length + originalIndex, originalIndex };
    })
    .sort((a, b) => a.rank - b.rank || a.originalIndex - b.originalIndex);
  return ranked.map((entry) => entry.section.id);
}

export type SiteUpgradeOptions = {
  /** Maximum actions to emit. Callers pass their remaining action budget. */
  cap?: number;
  /** Skip the visual pass (theme/backdrop/effects) when true. */
  keepLook?: boolean;
};

export function planWholeSiteUpgrade(
  context: AgentContext,
  intent: BuilderIntent,
  options: SiteUpgradeOptions = {},
): AgentAction[] {
  const cap = Math.max(1, options.cap ?? 40);
  const actions: AgentAction[] = [];

  const push = (action: AgentAction) => {
    if (actions.length >= cap) return false;
    actions.push(action);
    return true;
  };

  const allowedSectionKinds = new Set(context.sectionKinds);

  const keepLook = Boolean(options.keepLook) || intent.constraints.includes("keep_facts");

  /* ---------------------------------------------------------------- */
  /* 1. VISUAL DIRECTION                                              */
  /* ---------------------------------------------------------------- */

  const recommended = recommendDirections({
    businessName: context.business.name,
    industry: context.business.industry,
    services: context.business.services.map((service) => ({ name: service.name })),
    city: context.business.city,
    currentFont: context.business.fontPreference,
    count: 1,
    tone: "any",
  });
  const direction = recommended[0];

  if (direction && !keepLook) {
    push({
      type: "set_theme",
      patch: {
        primary_color: direction.primary,
        secondary_color: direction.secondary,
        accent_color: direction.accent,
        font_preference: direction.font,
      },
    });
    push({ type: "set_backdrop", backdrop: direction.backdrop });

    // Per-section effects across every visible section, oldest pages first.
    let effectBudget = 20;
    for (const page of context.pages) {
      if (!page.is_visible) continue;
      for (const section of page.sections) {
        if (!section.is_visible) continue;
        if (effectBudget <= 0) break;
        if (actions.length >= cap) break;
        push({
          type: "set_section_effect",
          sectionId: section.id,
          effect: sectionEffectFor(section.kind, direction) as never,
        });
        effectBudget -= 1;
      }
      if (actions.length >= cap) break;
    }
  }

  /* ---------------------------------------------------------------- */
  /* 2. FACTUAL HERO REWRITE                                          */
  /* ---------------------------------------------------------------- */

  const heading = factualHeadline(context);
  const subheading = factualSubheading(context);

  for (const page of context.pages) {
    if (!page.is_visible) continue;
    for (const section of page.sections) {
      if (section.kind !== "hero" || !section.is_visible) continue;
      if (heading && looksTemplated(section.heading)) {
        push({ type: "set_section_text", sectionId: section.id, field: "heading", value: heading });
      }
      if (subheading && looksTemplated(section.subheading)) {
        push({
          type: "set_section_text",
          sectionId: section.id,
          field: "subheading",
          value: subheading,
        });
      }
      if (actions.length >= cap) return actions;
    }
  }

  /* ---------------------------------------------------------------- */
  /* 3. ADD MISSING HIGH-VALUE SECTIONS ON HOME                       */
  /* ---------------------------------------------------------------- */

  const home = homePage(context);
  if (home) {
    for (const kind of HIGH_VALUE_SECTIONS) {
      if (actions.length >= cap) break;
      if (!allowedSectionKinds.has(kind)) continue;
      if (pageHasSection(home, kind)) continue;

      // Never fabricate content for a proof section — only add reviews when
      // the workspace actually has published reviews to show.
      if (kind === "reviews" && context.business.publishedReviewCount <= 0) continue;

      const seed =
        kind === "reviews"
          ? { heading: "What our customers say" }
          : kind === "faq"
            ? { heading: "Common questions" }
            : kind === "cta"
              ? { heading: "Ready to get started?" }
              : { heading: "Get in touch" };
      push({
        type: "add_section",
        pageId: home.id,
        kind,
        heading: seed.heading,
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* 4. REORDER HOME INTO CONVERSION SEQUENCE                          */
  /* ---------------------------------------------------------------- */

  if (home && actions.length < cap) {
    const currentIds = home.sections
      .filter((section) => section.is_visible)
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((section) => section.id);
    const desiredIds = conversionOrderedIds(home);
    if (needsReorder(currentIds, desiredIds)) {
      push({ type: "reorder_sections", pageId: home.id, sectionIds: desiredIds });
    }
  }

  return actions;
}
