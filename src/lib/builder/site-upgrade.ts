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

import type { AgentAction, SectionVisualPatch } from "@/lib/site-agent";
import type { AgentContext, SiteMapPage } from "@/lib/site-agent.server";
import type { BuilderIntent } from "@/lib/builder/interpreter";
import { recommendDirections } from "@/lib/design-directions";
import { siteVariation, type HeadingSlot } from "@/lib/site-variation";
import { compileNavigationRepairs } from "@/lib/builder/navigation-intelligence";

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

  /* ---------------------------------------------------------------- */
  /* 9. SECTION COMPOSITION — how each section is laid out             */
  /* ---------------------------------------------------------------- */

  if (!keepLook) {
    let compositionBudget = 14;
    for (const page of context.pages) {
      if (!page.is_visible || compositionBudget <= 0 || actions.length >= cap) break;
      for (const section of page.sections) {
        if (!section.is_visible) continue;
        if (compositionBudget <= 0 || actions.length >= cap) break;
        const patch = compositionFor(section.kind, variation);
        if (!patch) continue;
        push({ type: "set_section_visual", sectionId: section.id, patch });
        compositionBudget -= 1;
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* 10. EVERY PICTURE GETS A DESCRIPTION AND A SENSIBLE FRAME         */
  /* ---------------------------------------------------------------- */

  let mediaBudget = 12;
  for (const page of context.pages) {
    if (!page.is_visible || mediaBudget <= 0 || actions.length >= cap) break;
    for (const section of page.sections) {
      if (!section.is_visible) continue;
      for (const component of section.components) {
        if (mediaBudget <= 0 || actions.length >= cap) break;
        if (!MEDIA_COMPONENT_KINDS.has(component.kind)) continue;
        const alt = factualAltText(context, page, section, component);
        if (!alt) continue;
        push({
          type: "set_component_visual",
          componentId: component.id,
          patch: {
            alt,
            object_fit: "cover",
            object_position: "center",
            aspect_ratio: section.kind === "hero" ? "16:9" : "4:3",
            radius: section.kind === "hero" ? "large" : "medium",
            shadow: section.kind === "hero" ? "medium" : "soft",
          },
        });
        mediaBudget -= 1;
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* 11. READ THE WORDS FIRST, THEN THE BUTTON                         */
  /* ---------------------------------------------------------------- */

  let orderBudget = 6;
  for (const page of context.pages) {
    if (!page.is_visible || orderBudget <= 0 || actions.length >= cap) break;
    for (const section of page.sections) {
      if (!section.is_visible) continue;
      if (orderBudget <= 0 || actions.length >= cap) break;
      const ordered = readingOrderedComponentIds(section);
      if (!ordered) continue;
      push({ type: "reorder_components", sectionId: section.id, componentIds: ordered });
      orderBudget -= 1;
    }
  }

  /* ---------------------------------------------------------------- */
  /* 12. NO PAGE LEFT UNREACHABLE                                      */
  /* ---------------------------------------------------------------- */

  if (actions.length < cap) {
    const { actions: linkActions } = compileNavigationRepairs(
      context,
      "add internal links between pages",
      Math.min(4, cap - actions.length),
    );
    for (const action of linkActions) push(action);
  }

  /* ---------------------------------------------------------------- */
  /* 13. PAGES WITH TOO LITTLE ON THEM GET SOMETHING USEFUL            */
  /* ---------------------------------------------------------------- */

  let depthBudget = 3;
  for (const page of context.pages) {
    if (!page.is_visible || depthBudget <= 0 || actions.length >= cap) break;
    if (page.id === home?.id) continue;
    const visibleSections = page.sections.filter((section) => section.is_visible);
    if (visibleSections.length === 0 || visibleSections.length > 2) continue;
    const kind = DEPTH_SECTIONS.find(
      (candidate) => allowedSectionKinds.has(candidate) && !pageHasSection(page, candidate),
    );
    if (!kind) continue;
    push({ type: "add_section", pageId: page.id, kind, heading: variation.heading(kind) });
    depthBudget -= 1;
  }

  /* ---------------------------------------------------------------- */
  /* 14. HEADLINE PICTURES STAY READABLE BEHIND THE WORDS              */
  /* ---------------------------------------------------------------- */

  let overlayBudget = 4;
  for (const page of context.pages) {
    if (!page.is_visible || overlayBudget <= 0 || actions.length >= cap) break;
    const hero = page.sections.find((section) => section.is_visible && section.kind === "hero");
    if (!hero) continue;
    const media = hero.components.find((component) => MEDIA_COMPONENT_KINDS.has(component.kind));
    if (!media) continue;
    push({
      type: "set_component_visual",
      componentId: media.id,
      patch: { overlay: "soft", object_fit: "cover", object_position: "center" },
    });
    overlayBudget -= 1;
  }

  /* ---------------------------------------------------------------- */
  /* 15. VAGUE BUTTONS SAY WHAT THEY DO                                */
  /* ---------------------------------------------------------------- */

  if (ctaTarget) {
    let labelBudget = 6;
    for (const page of context.pages) {
      if (!page.is_visible || labelBudget <= 0 || actions.length >= cap) break;
      for (const section of page.sections) {
        if (!section.is_visible || labelBudget <= 0 || actions.length >= cap) break;
        for (const component of section.components) {
          if (labelBudget <= 0 || actions.length >= cap) break;
          if (component.kind !== "button" && component.kind !== "link") continue;
          if (!isVagueButtonLabel(component.label ?? component.link_label)) continue;
          push({
            type: "set_component",
            componentId: component.id,
            patch: { label: ctaTarget.label, link_label: ctaTarget.label },
          });
          labelBudget -= 1;
        }
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* 16. REAL WAYS TO GET IN TOUCH, ONE TAP AWAY                       */
  /* ---------------------------------------------------------------- */

  const phone = usablePhone(context);
  const email = context.business.email?.trim() || null;
  let contactBudget = 4;
  for (const page of context.pages) {
    if (!page.is_visible || contactBudget <= 0 || actions.length >= cap) break;
    for (const section of page.sections) {
      if (!section.is_visible || contactBudget <= 0 || actions.length >= cap) break;
      if (!CLOSING_KINDS.includes(section.kind)) continue;
      const links = section.components.map((component) => component.link_url ?? "");
      if (phone && !links.some((url) => url.startsWith("tel:"))) {
        push({
          type: "add_component",
          sectionId: section.id,
          kind: "link",
          label: `Call ${phone.display}`,
          link_label: `Call ${phone.display}`,
          link_url: `tel:${phone.dial}`,
        });
        contactBudget -= 1;
      }
      if (email && email.includes("@") && !links.some((url) => url.startsWith("mailto:"))) {
        push({
          type: "add_component",
          sectionId: section.id,
          kind: "link",
          label: `Email ${email}`,
          link_label: `Email ${email}`,
          link_url: `mailto:${email}`,
        });
        contactBudget -= 1;
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* 17. A PROOF STRIP, ONLY WHEN THERE IS REAL PROOF                  */
  /* ---------------------------------------------------------------- */

  if (
    home &&
    actions.length < cap &&
    allowedSectionKinds.has("trust_bar") &&
    !pageHasSection(home, "trust_bar") &&
    hasRealProof(context)
  ) {
    const name = context.business.name?.trim();
    push({
      type: "add_section",
      pageId: home.id,
      kind: "trust_bar",
      heading: name ? `${name} at a glance` : "At a glance",
    });
  }

  /* ---------------------------------------------------------------- */
  /* 18. NOTHING EMPTY STAYS ON SHOW                                   */
  /* ---------------------------------------------------------------- */

  let emptyBudget = 6;
  for (const page of context.pages) {
    if (!page.is_visible || emptyBudget <= 0 || actions.length >= cap) break;
    for (const section of page.sections) {
      if (!section.is_visible || emptyBudget <= 0 || actions.length >= cap) break;
      if (section.kind === "hero") continue;
      if (!isEmptySection(section)) continue;
      push({ type: "set_section_visibility", sectionId: section.id, visible: false });
      emptyBudget -= 1;
    }
  }

  /* ---------------------------------------------------------------- */
  /* 19. EVERY PAGE HAS A PROPER NAME                                  */
  /* ---------------------------------------------------------------- */

  let titleBudget = 4;
  for (const page of context.pages) {
    if (!page.is_visible || titleBudget <= 0 || actions.length >= cap) break;
    if (!looksTemplated(page.title)) continue;
    const derived = titleFromSlug(page.slug);
    if (!derived) continue;
    push({ type: "set_page", pageId: page.id, patch: { title: derived } });
    titleBudget -= 1;
  }

  /* ---------------------------------------------------------------- */
  /* 20. SHARING A LINK SHOWS THE RIGHT THING                          */
  /* ---------------------------------------------------------------- */

  let shareBudget = 5;
  for (const page of context.pages) {
    if (!page.is_visible || page.noindex || shareBudget <= 0 || actions.length >= cap) break;
    const patch = shareMetadata(context, page);
    if (!patch) continue;
    push({ type: "set_page", pageId: page.id, patch });
    shareBudget -= 1;
  }

  /* ---------------------------------------------------------------- */
  /* 21. SERVICE LISTS SHOW THE REAL SERVICES                          */
  /* ---------------------------------------------------------------- */

  const realServices = context.business.services.filter(
    (service) => (service.name ?? "").trim().length > 1,
  );
  if (realServices.length > 0) {
    let serviceBudget = 6;
    for (const page of context.pages) {
      if (!page.is_visible || serviceBudget <= 0 || actions.length >= cap) break;
      for (const section of page.sections) {
        if (!section.is_visible || serviceBudget <= 0 || actions.length >= cap) break;
        if (section.kind !== "services") continue;
        if (section.components.length > 0) continue;
        for (const service of realServices.slice(0, serviceBudget)) {
          if (actions.length >= cap) break;
          const price = priceLabel(service);
          push({
            type: "add_component",
            sectionId: section.id,
            kind: "text",
            label: service.name.trim(),
            ...(price ? { body: price } : {}),
          });
          serviceBudget -= 1;
        }
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* 22. NO EMPTY PHOTO WALLS                                          */
  /* ---------------------------------------------------------------- */

  if (context.business.photoCount <= 0) {
    let galleryBudget = 3;
    for (const page of context.pages) {
      if (!page.is_visible || galleryBudget <= 0 || actions.length >= cap) break;
      for (const section of page.sections) {
        if (!section.is_visible || galleryBudget <= 0 || actions.length >= cap) break;
        if (section.kind !== "gallery" && section.kind !== "portfolio") continue;
        if (section.components.some((component) => MEDIA_COMPONENT_KINDS.has(component.kind))) continue;
        push({ type: "set_section_visibility", sectionId: section.id, visible: false });
        galleryBudget -= 1;
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* 23. NO PRICE BLOCK WITHOUT REAL PRICES                            */
  /* ---------------------------------------------------------------- */

  const hasRealPrice = context.business.services.some((service) => priceLabel(service) !== null);
  if (!hasRealPrice) {
    let pricingBudget = 2;
    for (const page of context.pages) {
      if (!page.is_visible || pricingBudget <= 0 || actions.length >= cap) break;
      for (const section of page.sections) {
        if (!section.is_visible || pricingBudget <= 0 || actions.length >= cap) break;
        if (section.kind !== "pricing") continue;
        if (section.components.length > 0) continue;
        push({ type: "set_section_visibility", sectionId: section.id, visible: false });
        pricingBudget -= 1;
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* 24. EVERY SECTION HAS A HEADING TO SCAN                           */
  /* ---------------------------------------------------------------- */

  let headingBudget = 8;
  for (const page of context.pages) {
    if (!page.is_visible || headingBudget <= 0 || actions.length >= cap) break;
    for (const section of page.sections) {
      if (!section.is_visible || headingBudget <= 0 || actions.length >= cap) break;
      if (section.kind === "hero") continue;
      if ((section.heading ?? "").trim().length > 0) continue;
      if (isEmptySection(section)) continue;
      if (!HEADING_SLOTS.includes(section.kind as HeadingSlot)) continue;
      push({
        type: "set_section_text",
        sectionId: section.id,
        field: "heading",
        value: variation.heading(section.kind as HeadingSlot),
      });
      headingBudget -= 1;
    }
  }

  /* ---------------------------------------------------------------- */
  /* 25. A CONTACT PAGE THAT ACTUALLY LETS PEOPLE ENQUIRE              */
  /* ---------------------------------------------------------------- */

  for (const page of context.pages) {
    if (actions.length >= cap) break;
    if (!page.is_visible) continue;
    const isContactPage = page.kind === "contact" || /contact|book|quote/i.test(page.slug);
    if (!isContactPage) continue;
    if (page.sections.some((section) => section.is_visible && CLOSING_KINDS.includes(section.kind))) continue;
    if (!allowedSectionKinds.has("contact")) continue;
    push({ type: "add_section", pageId: page.id, kind: "contact", heading: "Get in touch" });
  }

  return actions;
}

/** Every heading slot the site variation can write a factual heading for. */
const HEADING_SLOTS: HeadingSlot[] = [
  "services",
  "process",
  "benefits",
  "pricing",
  "gallery",
  "reviews",
  "areas",
  "faq",
  "quote",
  "booking",
  "cta",
  "contact",
  "intro",
];

/** A real price, written from the number the owner entered. Never invented. */
function priceLabel(service: { price: number | null; startingPrice: number | null }): string | null {
  if (typeof service.price === "number" && service.price > 0) return `$${service.price}`;
  if (typeof service.startingPrice === "number" && service.startingPrice > 0) {
    return `From $${service.startingPrice}`;
  }
  return null;
}

/** Button wording that tells a visitor nothing about what happens next. */
const VAGUE_BUTTON_LABELS = new Set([
  "click here",
  "click",
  "here",
  "submit",
  "send",
  "go",
  "button",
  "read more",
  "more",
  "link",
  "learn more",
]);

function isVagueButtonLabel(value: string | null | undefined): boolean {
  const text = (value ?? "").trim().toLowerCase();
  if (text.length === 0) return true;
  return VAGUE_BUTTON_LABELS.has(text);
}

/** The business's own phone number, in a display form and a dialable form. */
function usablePhone(context: AgentContext): { display: string; dial: string } | null {
  const raw = context.business.phone?.trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return { display: raw, dial: raw.replace(/[^\d+]/g, "") };
}

/** True only when the workspace holds something real to be proud of. */
function hasRealProof(context: AgentContext): boolean {
  const years = Number(context.business.yearsInBusiness ?? 0);
  return years >= 1 || context.business.publishedReviewCount > 0 || context.business.photoCount > 0;
}

/** A section with no words and nothing in it — dead space on the page. */
function isEmptySection(section: {
  heading: string | null;
  subheading: string | null;
  body: string | null;
  components: unknown[];
}): boolean {
  const text = [section.heading, section.subheading, section.body]
    .map((value) => (value ?? "").trim())
    .join("");
  return text.length === 0 && section.components.length === 0;
}

/** Turn a page address into a readable page name: "/our-services" → "Our Services". */
function titleFromSlug(slug: string): string | null {
  const cleaned = slug.replace(/^\/+|\/+$/g, "").split("/").pop() ?? "";
  if (cleaned.length < 2) return null;
  const words = cleaned
    .split(/[-_]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  if (words.length === 0) return null;
  return words.join(" ").slice(0, 60);
}

/**
 * Sharing metadata built only from wording that already exists on the page or
 * from real business facts. Empty fields only — never an overwrite.
 */
function shareMetadata(context: AgentContext, page: SiteMapPage) {
  const name = context.business.name?.trim();
  if (!name) return null;
  const patch: { og_title?: string; og_description?: string } = {};
  const title = page.seo_title?.trim() || (page.title?.trim() ? `${page.title.trim()} | ${name}` : name);
  const description = page.seo_description?.trim() || context.business.description?.trim() || null;
  if (title) patch.og_title = title.slice(0, 70);
  if (description && description.length >= 24) {
    patch.og_description = description.slice(0, 200);
  }
  return patch.og_title || patch.og_description ? patch : null;
}


/** Component kinds that carry a picture. */
const MEDIA_COMPONENT_KINDS = new Set([
  "image",
  "gallery",
  "media",
  "photo",
  "hero_image",
  "logo",
]);

/** Component kinds that are an action rather than something to read. */
const ACTION_COMPONENT_KINDS = new Set(["button", "link", "cta", "form"]);

/** Sections worth adding to a page that has almost nothing on it. */
const DEPTH_SECTIONS: HeadingSlot[] = ["services", "faq", "cta"];

/**
 * A description for a picture, written only from text that already exists in
 * this workspace. Returns null when there is nothing real to say.
 */
function factualAltText(
  context: AgentContext,
  page: SiteMapPage,
  section: { kind: string; heading: string | null },
  component: { label: string | null; body: string | null },
): string | null {
  const own = component.label?.trim() || component.body?.trim();
  if (own && own.length >= 3) return own.slice(0, 160);

  const name = context.business.name?.trim();
  if (!name) return null;

  const sectionHeading = section.heading?.trim();
  if (sectionHeading && sectionHeading.length >= 3) {
    return `${sectionHeading} — ${name}`.slice(0, 160);
  }

  const pageTitle = page.title?.trim();
  if (pageTitle && pageTitle.length >= 3 && page.kind !== "home") {
    return `${pageTitle} — ${name}`.slice(0, 160);
  }

  const service = primaryService(context);
  return (service ? `${service} by ${name}` : name).slice(0, 160);
}

/**
 * Words before buttons inside a section. Returns null when the section already
 * reads in that order, so we never emit a no-op change.
 */
function readingOrderedComponentIds(section: {
  components: { id: string; kind: string; sort_order: number }[];
}): string[] | null {
  const components = section.components.slice().sort((a, b) => a.sort_order - b.sort_order);
  if (components.length < 2) return null;
  const desired = components
    .map((component, index) => ({
      component,
      index,
      rank: ACTION_COMPONENT_KINDS.has(component.kind) ? 1 : 0,
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.component.id);
  const current = components.map((component) => component.id);
  if (desired.every((id, index) => id === current[index])) return null;
  return desired;
}

/**
 * Layout composition per section kind, keyed to this business's own variation
 * so two workspaces in the same trade don't come out identical.
 */
function compositionFor(
  kind: string,
  variation: ReturnType<typeof siteVariation>,
): SectionVisualPatch | null {
  const airy = variation.heroVariant.length % 2 === 0;
  switch (kind) {
    case "hero":
      return {
        layout: airy ? "split" : "centered",
        image_position: airy ? "right" : "background",
        image_treatment: airy ? "soft_shadow" : "cinematic",
        spacing: "generous",
        max_width: "wide",
        image_ratio: "16:9",
        density: "airy",
      };
    case "services":
    case "features":
    case "benefits":
    case "pricing":
      return {
        layout: "centered",
        card_style: airy ? "soft" : "floating",
        spacing: "standard",
        max_width: "standard",
        density: "balanced",
      };
    case "gallery":
    case "portfolio":
      return {
        layout: "full_bleed",
        image_treatment: "rounded",
        spacing: "standard",
        max_width: "wide",
        image_ratio: "4:3",
      };
    case "reviews":
      return { layout: "centered", card_style: "editorial", spacing: "generous", max_width: "standard" };
    case "about":
    case "intro":
    case "process":
      return {
        layout: airy ? "image_left" : "editorial",
        spacing: "standard",
        max_width: "narrow",
        density: "airy",
      };
    case "faq":
      return { layout: "stacked", spacing: "standard", max_width: "narrow", density: "balanced" };
    case "cta":
    case "offer":
      return { layout: "centered", spacing: "generous", max_width: "standard", card_style: "glass" };
    case "contact":
    case "booking":
    case "quote":
      return { layout: "split", spacing: "standard", max_width: "standard", card_style: "soft" };
    default:
      return null;
  }
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
