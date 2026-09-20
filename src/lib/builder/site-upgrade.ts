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

import type { AgentAction } from "@/lib/site-agent";
import type { AgentContext, SiteMapPage } from "@/lib/site-agent.server";
import type { BuilderIntent } from "@/lib/builder/interpreter";
import { recommendDirections } from "@/lib/design-directions";
import { siteVariation } from "@/lib/site-variation";

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

  /* ---------------------------------------------------------------- */
  /* 5. LAYOUT VARIANTS — a look that is unique to this business       */
  /* ---------------------------------------------------------------- */

  const variation = siteVariation({
    businessName: context.business.name,
    industry: context.business.industry,
    city: context.business.city,
  });

  if (!keepLook) {
    let variantBudget = 12;
    for (const page of context.pages) {
      if (!page.is_visible) continue;
      for (const section of page.sections) {
        if (!section.is_visible) continue;
        if (variantBudget <= 0 || actions.length >= cap) break;
        const variant = variantFor(section.kind, variation);
        if (!variant || variant === section.variant) continue;
        push({ type: "set_section_variant", sectionId: section.id, variant });
        variantBudget -= 1;
      }
      if (actions.length >= cap) break;
    }
  }

  /* ---------------------------------------------------------------- */
  /* 6. EVERY PAGE GETS A CLOSING ASK + A READABLE ORDER              */
  /* ---------------------------------------------------------------- */

  let closingBudget = 4;
  for (const page of context.pages) {
    if (actions.length >= cap) break;
    if (!page.is_visible || page.id === home?.id) continue;

    if (
      closingBudget > 0 &&
      allowedSectionKinds.has("cta") &&
      !CLOSING_KINDS.some((kind) => pageHasSection(page, kind))
    ) {
      push({ type: "add_section", pageId: page.id, kind: "cta", heading: variation.heading("cta") });
      closingBudget -= 1;
    }

    const currentIds = page.sections
      .filter((section) => section.is_visible)
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((section) => section.id);
    const desiredIds = conversionOrderedIds(page);
    if (needsReorder(currentIds, desiredIds)) {
      push({ type: "reorder_sections", pageId: page.id, sectionIds: desiredIds });
    }
  }

  /* ---------------------------------------------------------------- */
  /* 7. AN OBVIOUS NEXT STEP IN EVERY HERO                            */
  /* ---------------------------------------------------------------- */

  const ctaTarget = primaryCtaTarget(context);
  if (ctaTarget) {
    let ctaBudget = 4;
    for (const page of context.pages) {
      if (!page.is_visible || ctaBudget <= 0 || actions.length >= cap) break;
      const hero = page.sections.find((section) => section.is_visible && section.kind === "hero");
      if (!hero) continue;
      if (hero.components.some((component) => component.kind === "button" || component.link_url)) continue;
      push({
        type: "add_component",
        sectionId: hero.id,
        kind: "button",
        label: ctaTarget.label,
        link_url: ctaTarget.url,
        link_label: ctaTarget.label,
      });
      ctaBudget -= 1;
    }
  }

  /* ---------------------------------------------------------------- */
  /* 8. SEARCH TITLES AND DESCRIPTIONS WHERE THEY ARE MISSING         */
  /* ---------------------------------------------------------------- */

  let seoBudget = 6;
  for (const page of context.pages) {
    if (seoBudget <= 0 || actions.length >= cap) break;
    if (!page.is_visible || page.noindex) continue;
    const patch = factualPageSeo(context, page);
    if (!patch) continue;
    push({ type: "set_page", pageId: page.id, patch });
    seoBudget -= 1;
  }

  return actions;
}

/** Section kinds that already close a page with an ask. */
const CLOSING_KINDS = ["cta", "contact", "booking", "quote"];

function variantFor(kind: string, variation: ReturnType<typeof siteVariation>): string | null {
  switch (kind) {
    case "hero":
      return variation.heroVariant;
    case "services":
      return variation.serviceVariant;
    case "reviews":
      return variation.proofVariant;
    case "cta":
      return variation.ctaVariant;
    default:
      return null;
  }
}

/**
 * The safest real destination for a headline button: an existing contact-style
 * page, otherwise the business's own phone number. Never a made-up link.
 */
function primaryCtaTarget(context: AgentContext): { label: string; url: string } | null {
  const contactPage = context.pages.find(
    (page) => page.is_visible && (page.kind === "contact" || /contact|book|quote/i.test(page.slug)),
  );
  if (contactPage) {
    const slug = contactPage.slug.startsWith("/") ? contactPage.slug : `/${contactPage.slug}`;
    return { label: "Get in touch", url: slug };
  }
  const phone = context.business.phone?.trim();
  if (phone && phone.replace(/\D/g, "").length >= 7) {
    return { label: `Call ${phone}`, url: `tel:${phone.replace(/[^\d+]/g, "")}` };
  }
  return null;
}

/**
 * Build page search text only from real facts, and only for the fields that
 * are actually empty — an owner-written title or description is untouched.
 */
function factualPageSeo(context: AgentContext, page: SiteMapPage) {
  const name = context.business.name?.trim();
  if (!name) return null;

  const title = page.title?.trim() || (page.kind === "home" ? "Home" : "");
  if (!title) return null;

  const location = locationPhrase(context);
  const patch: { seo_title?: string; seo_description?: string } = {};

  if (!page.seo_title?.trim()) {
    patch.seo_title = (page.kind === "home" && location
      ? `${name} — ${location}`
      : page.kind === "home"
        ? name
        : `${title} | ${name}`
    ).slice(0, 60);
  }

  if (!page.seo_description?.trim()) {
    const description = context.business.description?.trim();
    const service = primaryService(context);
    const sentence =
      description && description.length >= 24
        ? description
        : service && location
          ? `${name} provides ${service.toLowerCase()} in ${location}. See services and get in touch.`
          : service
            ? `${name} provides ${service.toLowerCase()}. See services and get in touch.`
            : location
              ? `${name}, serving ${location}. See what we do and get in touch.`
              : null;
    if (sentence) patch.seo_description = sentence.slice(0, 160);
  }

  return patch.seo_title || patch.seo_description ? patch : null;
}
