/**
 * Turns a generated plan + copy into the real page/section/component rows the
 * builder edits and the public site renders.
 *
 * Without this step a build finishes with a plan stored in `website_settings`
 * but nothing to edit or publish. It only ever writes facts that were supplied
 * (services, phone, email, area, years in business) — never invented claims —
 * and it never overwrites a site that already has pages, so a rebuild can't
 * silently erase the owner's edits.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { safeLinkUrl } from "@/lib/website-content";
import type { DesignDirection } from "@/lib/design-directions";
import { writeSectionEffect } from "@/lib/site-effects";
import { writeSectionVisual } from "@/lib/site-style";
import { compositionForKind, variantForKind } from "@/lib/builder/elite-site-output";
import {
  sectionDesignFromFingerprint,
  type DesignFingerprint,
} from "@/lib/builder/design-fingerprint";
import type { IndustryPlaybook } from "@/lib/builder/industry";
import {
  resolveArchetypeText,
  type ArchetypeSection,
  type SiteArchetype,
} from "@/lib/site-archetypes";

type Db = SupabaseClient;

type ServiceRow = {
  name: string;
  description?: string | null;
  price?: number | null;
  starting_price?: number | null;
};

type Copy = {
  heroHeadline: string;
  heroSubheadline: string;
  primaryCta: string;
  secondaryCta: string;
  intro: string;
  about: string;
  benefits: string[];
  serviceCards: { name: string; copy: string }[];
  faqs: { question: string; answer: string }[];
  areaCopy: string;
  metaTitle: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
};

export type MaterializeInput = {
  businessName: string;
  copy: Copy;
  services: ServiceRow[];
  city: string | null;
  state: string | null;
  serviceArea: string | null;
  phone: string | null;
  email: string | null;
  yearsInBusiness: number | null;
  photoCount: number;
  hasQuoteForm: boolean;
  hasBooking: boolean;
  /** The industry-specific visual identity selected for this first build. */
  direction?: DesignDirection | null;
  /** The kind of website this business needs (restaurant, clinic, shop …). */
  archetype?: SiteArchetype | null;
  /** Complete composition identity resolved before first materialization. */
  fingerprint?: DesignFingerprint | null;
  /** Full industry strategy used to order the home narrative. */
  industryPlaybook?: IndustryPlaybook | null;
};

type Component = {
  kind: string;
  label?: string | null;
  body?: string | null;
  link_label?: string | null;
  link_url?: string | null;
};

type Section = {
  kind: string;
  variant?: string;
  heading?: string | null;
  subheading?: string | null;
  body?: string | null;
  components?: Component[];
};

type Page = {
  slug: string;
  title: string;
  kind: string;
  seo_title?: string | null;
  seo_description?: string | null;
  sections: Section[];
};

const clean = (value: string | null | undefined) => {
  const text = (value ?? "").trim();
  return text.length ? text : null;
};

/**
 * Keeps an archetype section only when the business actually supplied the facts
 * it would display. An empty gallery or price list is worse than no section.
 */
function archetypeSectionSupported(kind: string, input: MaterializeInput): boolean {
  const priced = input.services.some(
    (service) => service.price !== null || service.starting_price !== null,
  );
  const place = Boolean(
    clean([input.city, input.state].filter(Boolean).join(", ")) ?? clean(input.serviceArea),
  );
  switch (kind) {
    case "gallery":
      return input.photoCount > 0;
    case "pricing":
      return priced;
    case "reviews":
    case "offer":
      return false; // no supplied testimonials or offers at first build
    case "stats":
      return input.yearsInBusiness !== null;
    case "area":
    case "areas":
      return place;
    case "quote":
      return input.hasQuoteForm;
    case "booking":
      return input.hasBooking;
    case "services":
      return input.services.length > 0 || input.copy.serviceCards.length > 0;
    case "benefits":
      return input.copy.benefits.length > 0;
    case "faq":
      return input.copy.faqs.length > 0;
    default:
      return true;
  }
}

function archetypeSections(
  sections: ArchetypeSection[],
  input: MaterializeInput,
  place: string | null,
): Section[] {
  const context = { businessName: input.businessName, place };
  return sections
    .filter((section) => archetypeSectionSupported(section.kind, input))
    .map((section) => ({
      kind: section.kind,
      heading: resolveArchetypeText(section.heading, context),
      subheading: section.subheading ? resolveArchetypeText(section.subheading, context) : null,
    }));
}

/** Builds the page tree. Pure — easy to reason about and to test. */
export function planSiteContent(input: MaterializeInput): Page[] {
  const { copy, services } = input;
  const place =
    clean([input.city, input.state].filter(Boolean).join(", ")) ?? clean(input.serviceArea);
  const primaryTarget = input.hasQuoteForm ? "/#quote" : input.hasBooking ? "/book" : "/contact";
  const primaryCta = clean(copy.primaryCta) ?? "Get in touch";
  const secondaryCta = clean(copy.secondaryCta) ?? "See services";

  const serviceCards: Component[] = (
    services.length
      ? services.map((service) => ({
          name: service.name,
          body:
            clean(copy.serviceCards.find((card) => card.name === service.name)?.copy) ??
            clean(service.description),
        }))
      : copy.serviceCards.map((card) => ({ name: card.name, body: clean(card.copy) }))
  ).map((card) => ({ kind: "card", label: card.name, body: card.body ?? null }));

  const trustItems: Component[] = [
    input.yearsInBusiness
      ? { kind: "feature", label: `${input.yearsInBusiness} years in business` }
      : null,
    place ? { kind: "feature", label: `Serving ${place}` } : null,
    input.phone ? { kind: "feature", label: "Call or text for a fast answer" } : null,
  ].filter(Boolean) as Component[];

  const home: Page = {
    slug: "home",
    title: "Home",
    kind: "home",
    seo_title: clean(copy.metaTitle),
    seo_description: clean(copy.metaDescription),
    sections: [
      {
        kind: "hero",
        heading: clean(copy.heroHeadline) ?? input.businessName,
        subheading: clean(copy.heroSubheadline),
        components: [
          { kind: "button", label: primaryCta, link_label: primaryCta, link_url: primaryTarget },
          { kind: "button", label: secondaryCta, link_label: secondaryCta, link_url: "/services" },
        ],
      },
      ...(trustItems.length ? [{ kind: "trust_bar", components: trustItems }] : []),
      ...(clean(copy.intro)
        ? [{ kind: "intro", heading: `About ${input.businessName}`, body: clean(copy.intro) }]
        : []),
      ...(serviceCards.length
        ? [
            {
              kind: "services",
              heading: "What we do",
              subheading: place ? `Services available across ${place}.` : null,
              components: serviceCards,
            },
          ]
        : []),
      ...(copy.benefits.length
        ? [
            {
              kind: "benefits",
              heading: "Why customers choose us",
              components: copy.benefits.map((benefit) => ({ kind: "feature", label: benefit })),
            },
          ]
        : []),
      ...(input.hasQuoteForm
        ? [
            {
              kind: "quote",
              heading: "Get a price",
              subheading: "Answer a few questions and we'll come back to you.",
            },
          ]
        : []),
      ...(input.hasBooking
        ? [{ kind: "booking", heading: "Book a time", subheading: "Pick a slot that suits you." }]
        : []),
      ...(copy.faqs.length
        ? [
            {
              kind: "faq",
              heading: "Common questions",
              components: copy.faqs.map((faq) => ({
                kind: "faq",
                label: faq.question,
                body: faq.answer,
              })),
            },
          ]
        : []),
      {
        kind: "cta",
        heading: `Ready to get started with ${input.businessName}?`,
        body: clean(copy.areaCopy),
        components: [
          { kind: "button", label: primaryCta, link_label: primaryCta, link_url: primaryTarget },
        ],
      },
      { kind: "sticky_cta" },
    ],
  };

  // Shape the home page for the kind of business this is, before the closing CTA.
  if (input.archetype) {
    const extra = archetypeSections(input.archetype.homeSections, input, place).filter(
      (section) => !home.sections.some((existing) => existing.kind === section.kind),
    );
    const closing = home.sections.findIndex((section) => section.kind === "cta");
    home.sections.splice(closing >= 0 ? closing : home.sections.length, 0, ...extra);
  }

  // The industry playbook controls the narrative order. Unsupported or
  // fact-dependent blocks remain absent; this only reorders real content.
  if (input.industryPlaybook) {
    const aliases: Record<string, string> = { area: "areas", case_studies: "gallery" };
    const preferred = input.industryPlaybook.homeSections.map((kind) => aliases[kind] ?? kind);
    const rank = (kind: string) => {
      if (kind === "hero") return -100;
      if (kind === "sticky_cta") return 10_000;
      const found = preferred.indexOf(kind);
      if (found >= 0) return found;
      if (kind === "cta") return preferred.length + 20;
      if (kind === "contact") return preferred.length + 30;
      return preferred.length + 10;
    };
    home.sections = home.sections
      .map((section, index) => ({ section, index }))
      .sort((a, b) => rank(a.section.kind) - rank(b.section.kind) || a.index - b.index)
      .map(({ section }) => section);
  }

  const pages: Page[] = [home];

  if (serviceCards.length)
    pages.push({
      slug: "services",
      title: "Services",
      kind: "services",
      seo_title: clean(`Services — ${input.businessName}`),
      seo_description: clean(copy.metaDescription),
      sections: [
        {
          kind: "services",
          heading: "Our services",
          subheading: clean(copy.intro),
          components: serviceCards,
        },
        {
          kind: "cta",
          heading: "Not sure which one you need?",
          body: "Tell us what you're dealing with and we'll point you the right way.",
          components: [
            { kind: "button", label: primaryCta, link_label: primaryCta, link_url: primaryTarget },
          ],
        },
      ],
    });

  const priced = services.filter(
    (service) => service.price !== null || service.starting_price !== null,
  );
  if (priced.length)
    pages.push({
      slug: "pricing",
      title: "Pricing",
      kind: "pricing",
      seo_title: clean(`Pricing — ${input.businessName}`),
      sections: [
        {
          kind: "pricing",
          heading: "Pricing",
          subheading: "Straight answers on what things cost.",
          components: priced.map((service) => ({
            kind: "price_row",
            label: service.name,
            body: `${service.starting_price ? "From " : ""}$${Number(
              service.starting_price ?? service.price,
            ).toLocaleString()}`,
          })),
        },
      ],
    });

  pages.push({
    slug: "about",
    title: "About",
    kind: "about",
    seo_title: clean(`About ${input.businessName}`),
    sections: [
      {
        kind: "intro",
        heading: `About ${input.businessName}`,
        body: clean(copy.about) ?? clean(copy.intro),
      },
      ...(place
        ? [
            {
              kind: "area",
              heading: `Where we work`,
              body: clean(copy.areaCopy) ?? `${input.businessName} serves ${place}.`,
            },
          ]
        : []),
    ],
  });

  if (input.hasBooking)
    pages.push({
      slug: "book",
      title: "Book",
      kind: "book",
      seo_title: clean(`Book ${input.businessName}`),
      sections: [
        { kind: "booking", heading: "Book a time", subheading: "Pick a slot that suits you." },
      ],
    });

  // Pages that only this kind of business needs — a menu, rooms, listings,
  // programmes, a timetable — instead of one universal service-site shape.
  for (const page of input.archetype?.pages ?? []) {
    if (pages.some((existing) => existing.slug === page.slug)) continue;
    const sections = archetypeSections(page.sections, input, place);
    if (!sections.length) continue;
    const title = resolveArchetypeText(page.title, { businessName: input.businessName, place });
    pages.push({
      slug: page.slug,
      title,
      kind: page.kind,
      seo_title: clean(`${title} — ${input.businessName}`),
      seo_description: clean(copy.metaDescription),
      sections: sections.map((section) =>
        section.kind === "cta"
          ? {
              ...section,
              components: [
                { kind: "button", label: primaryCta, link_label: primaryCta, link_url: primaryTarget },
              ],
            }
          : section,
      ),
    });
  }

  pages.push({
    slug: "contact",
    title: "Contact",
    kind: "contact",
    seo_title: clean(`Contact ${input.businessName}`),
    sections: [
      {
        kind: "contact",
        heading: "Contact us",
        subheading: input.phone || input.email ? null : "Send a message and we'll reply.",
      },
    ],
  });

  return pages;
}

/**
 * Gives every newly generated section a complete, renderable design contract.
 * This runs during first-site generation, rather than waiting for the owner to
 * ask the assistant to redesign an otherwise generic template.
 */
export function materializedSectionDesign(
  kind: string,
  direction: DesignDirection | null | undefined,
  fingerprint?: DesignFingerprint | null,
  index = 0,
): { variant: string; settings: Record<string, unknown> } {
  if (!direction) return { variant: "default", settings: {} };
  const dark = direction.secondary !== "#ffffff" && !/^#f/i.test(direction.secondary);
  const effect =
    kind === "hero"
      ? direction.heroEffect
      : kind === "cta" || kind === "offer" || kind === "sticky_cta"
        ? direction.ctaEffect
        : kind === "quote" || kind === "booking" || kind === "contact"
          ? direction.formEffect
          : direction.bodyEffect;
  const identity = fingerprint ? sectionDesignFromFingerprint(kind, fingerprint, index) : null;
  const visual = writeSectionVisual(
    {},
    identity
      ? {
          ...compositionForKind(kind, dark),
          layout: identity.layout,
          card_style: identity.cardStyle,
          image_treatment: identity.imageTreatment,
          max_width: identity.maxWidth,
          density: fingerprint?.density === "compact" ? "dense" : fingerprint?.density ?? "balanced",
        }
      : compositionForKind(kind, dark),
  );
  return {
    variant: identity?.variant ?? variantForKind(kind, direction.id),
    settings: writeSectionEffect(visual, effect),
  };
}

/**
 * Writes the tree for an organisation. Returns counts, and `skipped: true` when
 * the workspace already has pages (the owner's site is never replaced).
 */
export async function materializeSiteContent(
  db: Db,
  orgId: string,
  input: MaterializeInput,
): Promise<{ pages: number; sections: number; components: number; skipped: boolean }> {
  const { count } = await db
    .from("website_pages")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  if ((count ?? 0) > 0) return { pages: 0, sections: 0, components: 0, skipped: true };

  const tree = planSiteContent(input);
  let sections = 0;
  let components = 0;

  for (const [pageIndex, page] of tree.entries()) {
    const { data: pageRow, error: pageError } = await db
      .from("website_pages")
      .insert({
        organization_id: orgId,
        slug: page.slug,
        title: page.title,
        kind: page.kind,
        sort_order: pageIndex,
        is_visible: true,
        noindex: false,
        seo_title: page.seo_title ?? null,
        seo_description: page.seo_description ?? null,
      } as never)
      .select("id")
      .single();
    if (pageError) throw new Error(pageError.message);

    for (const [sectionIndex, section] of page.sections.entries()) {
      const design = materializedSectionDesign(section.kind, input.direction, input.fingerprint, sectionIndex);
      const { data: sectionRow, error: sectionError } = await db
        .from("website_sections")
        .insert({
          organization_id: orgId,
          page_id: (pageRow as { id: string }).id,
          kind: section.kind,
          variant: section.variant ?? design.variant,
          heading: section.heading ?? null,
          subheading: section.subheading ?? null,
          body: section.body ?? null,
          is_visible: true,
          sort_order: sectionIndex,
          settings: design.settings,
        } as never)
        .select("id")
        .single();
      if (sectionError) throw new Error(sectionError.message);
      sections += 1;

      const rows = (section.components ?? []).map((component, index) => ({
        organization_id: orgId,
        section_id: (sectionRow as { id: string }).id,
        kind: component.kind,
        label: component.label ?? null,
        body: component.body ?? null,
        link_label: component.link_label ?? null,
        link_url: safeLinkUrl(component.link_url ?? null),
        sort_order: index,
        is_visible: true,
      }));
      if (rows.length) {
        const { error } = await db.from("website_components").insert(rows as never);
        if (error) throw new Error(error.message);
        components += rows.length;
      }
    }
  }

  return { pages: tree.length, sections, components, skipped: false };
}
