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
  const visual = writeSectionVisual({}, compositionForKind(kind, dark));
  return {
    variant: variantForKind(kind, direction.id),
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
      const design = materializedSectionDesign(section.kind, input.direction);
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
