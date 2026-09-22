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
import { writeComponentVisual, writeSectionVisual } from "@/lib/site-style";
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
import type { FirstBuildImageAsset } from "@/lib/builder/first-build-images.server";
import type { CreativeBrief } from "@/lib/builder/creative-brief";
import {
  compileExecutableCreativeSection,
  writeExecutableCreativeSection,
} from "@/lib/builder/executable-creative";
import { slugify } from "@/lib/format";
import { compileSiteCampaign, type SiteCampaign } from "@/lib/builder/site-campaign";
import {
  applyDesignContract,
  type AiDesignContract,
  type MaterialPage,
} from "@/lib/builder/ai-design-contract";
import {
  compileAiDesignContract,
  requireAiDesignContract,
  type PageArchitecture,
} from "@/lib/builder/creative-authority";
import { deriveCandidateArchitecture } from "@/lib/builder/ai-page-architecture";
import { assertMediaIntegrity } from "@/lib/builder/media-integrity";

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
  /** Approved Sol/Terra presentation brief, compiled into a finite renderer contract. */
  creativeBrief?: CreativeBrief | null;
  /** Full industry strategy used to order the home narrative. */
  industryPlaybook?: IndustryPlaybook | null;
  /** Safe generated starter pictures saved in tenant media for this first build. */
  generatedAssets?: FirstBuildImageAsset[];
  /** Explicit, guarded replacement mode. Default rebuilds remain non-destructive. */
  replaceExisting?: boolean;
  /** Model that directed the design, recorded on the contract for observability. */
  directedBy?: string | null;
  /** Model that independently reviewed the design, when one did. */
  reviewedBy?: string | null;
  /** The conversion goal the design is built around. */
  conversionGoal?: string | null;
  /**
   * The AI's canonical design. When supplied it is the creative authority: it
   * decides which pages exist, which sections appear and in what order, and the
   * renderer only supplies safe building blocks. An empty required visual
   * container fails the build instead of shipping a blank box.
   */
  designContract?: AiDesignContract | null;
  /**
   * Lets the AI author the page architecture. It receives the architecture the
   * renderer can fill and returns its own page set, section selection and
   * order. Returning null keeps the renderer's candidate — nothing is invented.
   */
  architect?: (candidate: PageArchitecture[]) => Promise<PageArchitecture[] | null>;
};

type Component = {
  kind: string;
  label?: string | null;
  body?: string | null;
  link_label?: string | null;
  link_url?: string | null;
  media_url?: string | null;
  settings?: Record<string, unknown> | null;
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
  og_title?: string | null;
  og_description?: string | null;
  og_image_url?: string | null;
  sections: Section[];
};

const clean = (value: string | null | undefined) => {
  const text = (value ?? "").trim();
  return text.length ? text : null;
};

const GENERATED_IMAGE_CREDIT = "AI-generated starter image";

function mediaSettings(asset: FirstBuildImageAsset): Record<string, unknown> {
  return writeComponentVisual(
    {},
    {
      alt: asset.altText,
      object_fit: "cover",
      object_position: "center",
      overlay: asset.slot === "hero" || asset.slot === "cta" ? "gradient" : "none",
      radius: asset.slot === "hero" ? "large" : "medium",
      shadow: asset.slot === "hero" ? "strong" : "soft",
      aspect_ratio: asset.aspectRatio,
      source: "generated",
      credit: GENERATED_IMAGE_CREDIT,
      license: "Revora starter image",
    },
  );
}

function firstAsset(input: MaterializeInput, slot: FirstBuildImageAsset["slot"]) {
  return (input.generatedAssets ?? []).find((asset) => asset.slot === slot) ?? null;
}

function serviceAsset(
  input: MaterializeInput,
  serviceName: string,
  index: number,
): FirstBuildImageAsset | null {
  const serviceAssets = (input.generatedAssets ?? []).filter((asset) => asset.slot === "service");
  const exact = serviceAssets.find((asset) =>
    asset.label.toLowerCase().includes(serviceName.toLowerCase()),
  );
  return exact ?? serviceAssets[index] ?? null;
}

function imageComponent(asset: FirstBuildImageAsset, kind = "image"): Component {
  return {
    kind,
    label: asset.label,
    media_url: asset.path,
    settings: mediaSettings(asset),
  };
}

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
      return input.photoCount > 0 || (input.generatedAssets ?? []).length > 0;
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
  const heroAsset = firstAsset(input, "hero");
  const ctaAsset = firstAsset(input, "cta");
  const backgroundAsset = firstAsset(input, "background");
  const ogAsset = firstAsset(input, "social") ?? heroAsset;

  const serviceCards: Component[] = (
    services.length
      ? services.map((service, index) => ({
          name: service.name,
          body:
            clean(copy.serviceCards.find((card) => card.name === service.name)?.copy) ??
            clean(service.description),
          asset: serviceAsset(input, service.name, index),
        }))
      : copy.serviceCards.map((card, index) => ({
          name: card.name,
          body: clean(card.copy),
          asset: serviceAsset(input, card.name, index),
        }))
  ).map((card) => ({
    kind: "card",
    label: card.name,
    body: card.body ?? null,
    link_url: `/services/${slugify(card.name)}`,
    media_url: card.asset?.path ?? null,
    settings: card.asset ? mediaSettings(card.asset) : null,
  }));

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
    og_title: clean(copy.ogTitle),
    og_description: clean(copy.ogDescription),
    og_image_url: ogAsset?.path ?? null,
    sections: [
      {
        kind: "hero",
        heading: clean(copy.heroHeadline) ?? input.businessName,
        subheading: clean(copy.heroSubheadline),
        components: [
          { kind: "button", label: primaryCta, link_label: primaryCta, link_url: primaryTarget },
          { kind: "button", label: secondaryCta, link_label: secondaryCta, link_url: "/services" },
          ...(heroAsset ? [imageComponent(heroAsset, "hero_image")] : []),
        ],
      },
      ...(trustItems.length ? [{ kind: "trust_bar", components: trustItems }] : []),
      ...(clean(copy.intro)
        ? [{
            kind: "intro",
            heading: `About ${input.businessName}`,
            body: clean(copy.intro),
            components: backgroundAsset ? [imageComponent(backgroundAsset)] : [],
          }]
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
          ...(ctaAsset ? [imageComponent(ctaAsset, "image")] : []),
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
        og_image_url: ogAsset?.path ?? null,
      sections: [
        {
          kind: "hero",
          heading: `Services from ${input.businessName}`,
          subheading: place ? `Explore services available across ${place}.` : clean(copy.intro),
          components: [
            { kind: "button", label: primaryCta, link_label: primaryCta, link_url: primaryTarget },
            ...(heroAsset ? [imageComponent(heroAsset, "hero_image")] : []),
          ],
        },
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
            ...(ctaAsset ? [imageComponent(ctaAsset)] : []),
          ],
        },
      ],
    });

  // Every supplied service receives a real, image-led landing page. Copy stays
  // strictly source-derived: no invented inclusions, outcomes or guarantees.
  for (const [index, service] of services.slice(0, 12).entries()) {
    const asset = serviceAsset(input, service.name, index);
    const description =
      clean(copy.serviceCards.find((card) => card.name === service.name)?.copy) ??
      clean(service.description);
    const price = service.starting_price ?? service.price;
    pages.push({
      slug: `services/${slugify(service.name)}`,
      title: service.name,
      kind: "service",
      seo_title: clean(`${service.name} — ${input.businessName}`),
      seo_description: clean(description ?? copy.metaDescription),
      og_image_url: asset?.path ?? ogAsset?.path ?? null,
      sections: [
        {
          kind: "hero",
          heading: service.name,
          subheading: description,
          components: [
            { kind: "button", label: primaryCta, link_label: primaryCta, link_url: primaryTarget },
            ...(asset ? [imageComponent(asset, "hero_image")] : []),
          ],
        },
        {
          kind: "service_detail",
          heading: `About ${service.name}`,
          body: description,
          components: [
            ...(price !== null && price !== undefined
              ? [{
                  kind: "price_row",
                  label: service.name,
                  body: `${service.starting_price ? "From " : ""}$${Number(price).toLocaleString()}`,
                }]
              : []),
            { kind: "button", label: primaryCta, link_label: primaryCta, link_url: primaryTarget },
            ...(asset ? [imageComponent(asset)] : []),
          ],
        },
        ...(copy.faqs.length
          ? [{
              kind: "faq",
              heading: `${service.name} questions`,
              components: copy.faqs.slice(0, 4).map((faq) => ({ kind: "faq", label: faq.question, body: faq.answer })),
            }]
          : []),
        {
          kind: "cta",
          heading: `Ask about ${service.name}`,
          components: [{ kind: "button", label: primaryCta, link_label: primaryCta, link_url: primaryTarget }],
        },
      ],
    });
  }

  const priced = services.filter(
    (service) => service.price !== null || service.starting_price !== null,
  );
  if (priced.length)
    pages.push({
      slug: "pricing",
      title: "Pricing",
      kind: "pricing",
      seo_title: clean(`Pricing — ${input.businessName}`),
      seo_description: clean(copy.metaDescription),
      sections: [
        {
          kind: "hero",
          heading: `Pricing from ${input.businessName}`,
          subheading: "Review the prices supplied for available services.",
          components: [
            { kind: "button", label: primaryCta, link_label: primaryCta, link_url: primaryTarget },
            ...(backgroundAsset ? [imageComponent(backgroundAsset, "hero_image")] : []),
          ],
        },
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
        {
          kind: "cta",
          heading: "Ready to discuss what you need?",
          components: [{ kind: "button", label: primaryCta, link_label: primaryCta, link_url: primaryTarget }],
        },
      ],
    });

  pages.push({
    slug: "about",
    title: "About",
    kind: "about",
    seo_title: clean(`About ${input.businessName}`),
    seo_description: clean(copy.metaDescription),
    sections: [
      {
        kind: "hero",
        heading: `About ${input.businessName}`,
        subheading: clean(copy.about) ?? clean(copy.intro),
        components: [
          { kind: "button", label: primaryCta, link_label: primaryCta, link_url: primaryTarget },
          ...(backgroundAsset ? [imageComponent(backgroundAsset, "hero_image")] : []),
        ],
      },
      {
        kind: "intro",
        heading: "Our approach",
        body: clean(copy.about) ?? clean(copy.intro),
        components: ctaAsset ? [imageComponent(ctaAsset)] : [],
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
      ...(copy.benefits.length
        ? [{
            kind: "benefits",
            heading: "What matters in the work",
            components: copy.benefits.map((benefit) => ({ kind: "feature", label: benefit })),
          }]
        : []),
      {
        kind: "cta",
        heading: `Talk with ${input.businessName}`,
        components: [{ kind: "button", label: primaryCta, link_label: primaryCta, link_url: primaryTarget }],
      },
    ],
  });

  if (input.hasBooking)
    pages.push({
      slug: "book",
      title: "Book",
      kind: "book",
      seo_title: clean(`Book ${input.businessName}`),
      seo_description: clean(copy.metaDescription),
      sections: [
        {
          kind: "hero",
          heading: `Book with ${input.businessName}`,
          subheading: "Choose an available service and request a suitable time.",
          components: backgroundAsset ? [imageComponent(backgroundAsset, "hero_image")] : [],
        },
        { kind: "booking", heading: "Book a time", subheading: "Pick a slot that suits you." },
        {
          kind: "cta",
          heading: "Need help before booking?",
          components: [{ kind: "button", label: "Contact us", link_label: "Contact us", link_url: "/contact" }],
        },
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
      sections: [
        ...(!sections.some((section) => section.kind === "hero")
          ? [{
              kind: "hero",
              heading: title,
              subheading: place ? `${input.businessName} in ${place}.` : clean(copy.intro),
              components: [
                { kind: "button", label: primaryCta, link_label: primaryCta, link_url: primaryTarget },
                ...(backgroundAsset ? [imageComponent(backgroundAsset, "hero_image")] : []),
              ],
            }]
          : []),
        ...sections.map((section) =>
          section.kind === "cta"
          ? {
              ...section,
              components: [
                { kind: "button", label: primaryCta, link_label: primaryCta, link_url: primaryTarget },
              ],
            }
          : section),
        ...(!sections.some((section) => section.kind === "cta")
          ? [{
              kind: "cta",
              heading: `Talk with ${input.businessName} about ${title.toLowerCase()}`,
              components: [{ kind: "button", label: primaryCta, link_label: primaryCta, link_url: primaryTarget }],
            }]
          : []),
      ],
    });
  }

  pages.push({
    slug: "contact",
    title: "Contact",
    kind: "contact",
    seo_title: clean(`Contact ${input.businessName}`),
    seo_description: clean(copy.metaDescription),
    sections: [
      {
        kind: "hero",
        heading: `Contact ${input.businessName}`,
        subheading: place ? `Speak with the team serving ${place}.` : "Speak with the team directly.",
        components: ctaAsset ? [imageComponent(ctaAsset, "hero_image")] : [],
      },
      {
        kind: "contact",
        heading: "Contact us",
        subheading: input.phone || input.email ? null : "Send a message and we'll reply.",
      },
      ...(place
        ? [{ kind: "area", heading: "Service area", body: clean(copy.areaCopy) ?? `${input.businessName} serves ${place}.` }]
        : []),
      ...(input.hasQuoteForm
        ? [{ kind: "quote", heading: "Request a price", subheading: "Share what you need and the team can respond." }]
        : []),
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
  creativeBrief?: CreativeBrief | null,
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
  const settings = writeSectionEffect(visual, effect);
  return {
    variant: identity?.variant ?? variantForKind(kind, direction.id),
    settings: fingerprint
      ? writeExecutableCreativeSection(
          settings,
          compileExecutableCreativeSection(kind, fingerprint, creativeBrief),
        )
      : settings,
  };
}

/**
 * Writes the tree for an organisation. Returns counts, and `skipped: true` when
 * the workspace already has pages unless an owner/admin explicitly requested a
 * fresh rebuild and the caller already captured a restorable backup.
 */
export async function materializeSiteContent(
  db: Db,
  orgId: string,
  input: MaterializeInput,
): Promise<{
  pages: number;
  sections: number;
  components: number;
  skipped: boolean;
  campaign: SiteCampaign | null;
  /** The AI design this site was built from, when one governed the build. */
  designContract: AiDesignContract | null;
}> {
  const { count } = await db
    .from("website_pages")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  if ((count ?? 0) > 0) {
    if (!input.replaceExisting)
      return { pages: 0, sections: 0, components: 0, skipped: true, campaign: null, designContract: null };
    const { error: componentDeleteError } = await db.from("website_components").delete().eq("organization_id", orgId);
    if (componentDeleteError)
      throw new Error(`Couldn't clear old components before rebuilding: ${componentDeleteError.message}`);
    const { error: sectionDeleteError } = await db.from("website_sections").delete().eq("organization_id", orgId);
    if (sectionDeleteError)
      throw new Error(`Couldn't clear old sections before rebuilding: ${sectionDeleteError.message}`);
    const { error: pageDeleteError } = await db.from("website_pages").delete().eq("organization_id", orgId);
    if (pageDeleteError)
      throw new Error(`Couldn't clear old pages before rebuilding: ${pageDeleteError.message}`);
  }

  // The renderer produces safe building blocks; the AI design decides the site.
  // The contract OVERRIDES the renderer's page set and section order, and any
  // visual container the design requires must resolve to a real picture —
  // otherwise the build fails rather than publishing a blank box.
  let tree = planSiteContent(input);
  let designContract: AiDesignContract | null = input.designContract ?? null;
  if (!designContract && input.fingerprint && input.creativeBrief) {
    const primaryAction = clean(input.copy.primaryCta) ?? "Get in touch";
    // The AI authors the page set, the section selection and the order. The
    // renderer's own layout is only the inventory of fillable material.
    const candidate = deriveCandidateArchitecture(tree, primaryAction);
    const authored = input.architect ? await input.architect(candidate) : null;
    const architecture = authored && authored.length > 0 ? authored : candidate;
    designContract = requireAiDesignContract({
      attempt: compileAiDesignContract({
        businessName: input.businessName,
        fingerprint: input.fingerprint,
        brief: input.creativeBrief,
        directedBy: input.directedBy ?? "gpt-5.6-sol",
        reviewedBy: input.reviewedBy ?? null,
        conversionGoal: input.conversionGoal ?? "enquiries",
        navigationItems: architecture.map((page) => page.title),
        primaryAction,
        secondaryAction: clean(input.copy.secondaryCta),
        architecture,
      }),
      attempts: 1,
    });
  }
  if (designContract) {
    const applied = applyDesignContract(tree as unknown as MaterialPage[], designContract);
    assertMediaIntegrity(applied.pages, designContract);
    tree = applied.pages as unknown as typeof tree;
  }
  const campaign = input.fingerprint && input.creativeBrief
    ? compileSiteCampaign({
        fingerprint: input.fingerprint,
        brief: input.creativeBrief,
        pages: tree.map((page) => ({
          slug: page.slug,
          kind: page.kind,
          sectionKinds: page.sections.map((section) => section.kind),
        })),
        primaryAction: clean(input.copy.primaryCta) ?? "Get in touch",
        primaryTarget: input.hasQuoteForm ? "/#quote" : input.hasBooking ? "/book" : "/contact",
        hasPhone: Boolean(clean(input.phone)),
        hasPlace: Boolean(clean(input.city) || clean(input.state) || clean(input.serviceArea)),
      })
    : null;
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
        og_title: page.og_title ?? null,
        og_description: page.og_description ?? null,
        og_image_url: page.og_image_url ?? null,
      } as never)
      .select("id")
      .single();
    if (pageError) throw new Error(pageError.message);

    for (const [sectionIndex, section] of page.sections.entries()) {
      const design = materializedSectionDesign(
        section.kind,
        input.direction,
        input.fingerprint,
        pageIndex * 37 + sectionIndex,
        input.creativeBrief,
      );
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
        media_url: component.media_url ?? null,
        link_label: component.link_label ?? null,
        link_url: safeLinkUrl(component.link_url ?? null),
        settings: component.settings ?? {},
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

  return { pages: tree.length, sections, components, skipped: false, campaign, designContract };
}
