/**
 * Revora structured website content model.
 *
 * A client's website is stored as pages → sections → components, derived from
 * the business information they already entered. Nothing here invents facts:
 * every heading, service card and proof block is built from supplied data, and
 * blocks with no data are simply left out.
 */

import { localityLabel } from "./locality";
import { siteVariation } from "./site-variation";

export type PageKind =
  | "home"
  | "services"
  | "service"
  | "area"
  | "pricing"
  | "book"
  | "about"
  | "reviews"
  | "gallery"
  | "faq"
  | "offers"
  | "contact"
  | "thanks"
  | "privacy"
  | "blog"
  | "post"
  | "custom";

export type SectionKind =
  | "hero"
  | "trust_bar"
  | "intro"
  | "services"
  | "service_detail"
  | "benefits"
  | "process"
  | "stats"
  | "gallery"
  | "reviews"
  | "guarantee"
  | "offer"
  | "lead_magnet"
  | "area"
  | "areas"
  | "faq"
  | "pricing"
  | "quote"
  | "booking"
  | "cta"
  | "sticky_cta"
  | "contact"
  | "policy"
  | "post_list"
  | "embed"
  | "custom";

export type ContentComponent = {
  id: string;
  section_id: string;
  kind: string;
  label: string | null;
  body: string | null;
  media_url: string | null;
  link_url: string | null;
  link_label: string | null;
  settings: unknown;
  sort_order: number;
  is_visible: boolean;
};

/**
 * Only these link shapes ever reach a public page's href. Anything else
 * (javascript:, data:, vbscript: …) becomes a harmless in-page anchor, so a
 * builder/AI edit can never run script in a visitor's browser.
 */
export function safeLinkUrl(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (/^[#/]/.test(raw)) return raw.replace(/^\/\//, "/"); // relative path or anchor only
  if (/^(https?:|mailto:|tel:|sms:)/i.test(raw)) {
    if (/^https?:/i.test(raw)) {
      try {
        const url = new URL(raw);
        return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
      } catch {
        return null;
      }
    }
    return raw;
  }
  return null;
}

export type ContentSection = {
  id: string;
  page_id: string;
  kind: string;
  variant: string;
  heading: string | null;
  subheading: string | null;
  body: string | null;
  settings: unknown;
  sort_order: number;
  is_visible: boolean;
  components: ContentComponent[];
};

export type ContentPage = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  sort_order: number;
  is_visible: boolean;
  seo_title: string | null;
  seo_description: string | null;
  seo_canonical: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  noindex: boolean;
  sections: ContentSection[];
};

/** Search and social fields a client can edit per page. */
export const PAGE_SEO_FIELDS = [
  {
    key: "seo_title",
    label: "Search title",
    help: "Shown as the clickable headline in Google. Keep it under 60 characters.",
    max: 70,
  },
  {
    key: "seo_description",
    label: "Search description",
    help: "The summary under the title. Aim for 120-155 characters.",
    max: 170,
  },
  {
    key: "seo_canonical",
    label: "Canonical URL",
    help: "The one true address for this page. Leave blank to use the page's own URL.",
    max: 300,
  },
  {
    key: "og_title",
    label: "Share title",
    help: "Used when the page is shared on Facebook, LinkedIn or in a text message.",
    max: 90,
  },
  {
    key: "og_description",
    label: "Share description",
    help: "The preview text shown with the share title.",
    max: 200,
  },
  {
    key: "og_image_url",
    label: "Share image URL",
    help: "The image shown in link previews. 1200x630 works best.",
    max: 500,
  },
] as const;

export type PageSeoField = (typeof PAGE_SEO_FIELDS)[number]["key"];

/** Per-section search settings, stored inside the section's settings JSON. */
export type SectionSeo = {
  anchor?: string | undefined;
  seo_heading_level?: "h2" | "h3" | undefined;
  include_in_schema?: boolean | undefined;
  image_alt?: string | undefined;
};

export function readSectionSeo(settings: unknown): SectionSeo {
  if (!settings || typeof settings !== "object") return {};
  const seo = (settings as { seo?: unknown }).seo;
  return seo && typeof seo === "object" ? (seo as SectionSeo) : {};
}

export function writeSectionSeo(settings: unknown, patch: SectionSeo): Record<string, unknown> {
  const base =
    settings && typeof settings === "object" ? { ...(settings as Record<string, unknown>) } : {};
  base["seo"] = { ...readSectionSeo(settings), ...patch };
  return base;
}

/** Section types a business owner can add, in plain language. */
export const SECTION_LIBRARY: { kind: SectionKind; label: string; help: string }[] = [
  {
    kind: "hero",
    label: "Headline banner",
    help: "The first thing visitors read, with your main button.",
  },
  {
    kind: "trust_bar",
    label: "Trust strip",
    help: "Quick reassurance line: area covered, rating, response time.",
  },
  {
    kind: "intro",
    label: "Short introduction",
    help: "Two sentences on what you do and who you help.",
  },
  {
    kind: "services",
    label: "Services",
    help: "One card per service you offer, pulled from your service list.",
  },
  {
    kind: "service_detail",
    label: "Service detail",
    help: "The full write-up for one service, with its own button.",
  },
  {
    kind: "benefits",
    label: "Why choose us",
    help: "Short reasons to pick you — only ones you supplied.",
  },
  {
    kind: "process",
    label: "How it works",
    help: "The three or four steps from enquiry to job done.",
  },
  {
    kind: "stats",
    label: "Numbers",
    help: "Simple counts you can stand behind, like jobs completed.",
  },
  { kind: "gallery", label: "Photos of your work", help: "Uses the photos in your media library." },
  { kind: "reviews", label: "Customer reviews", help: "Shows published reviews only." },
  {
    kind: "guarantee",
    label: "Guarantee",
    help: "The promise you make — only what you actually offer.",
  },
  {
    kind: "offer",
    label: "Current offer",
    help: "A time-limited offer. Hidden until you write one.",
  },
  {
    kind: "lead_magnet",
    label: "Free guide / checklist",
    help: "Trades an email for something useful.",
  },
  { kind: "area", label: "Area you serve", help: "Where you work, for local search." },
  { kind: "areas", label: "All service areas", help: "Links to every town or neighbourhood page." },
  {
    kind: "faq",
    label: "Questions & answers",
    help: "Answers common questions before people call.",
  },
  { kind: "pricing", label: "Pricing guide", help: "Starting prices so visitors self-qualify." },
  { kind: "quote", label: "Instant quote form", help: "The quote calculator that creates a lead." },
  { kind: "booking", label: "Booking form", help: "Lets visitors pick a service and time." },
  { kind: "cta", label: "Call to action", help: "A prompt to call, book or request a quote." },
  {
    kind: "sticky_cta",
    label: "Sticky call bar",
    help: "Always-visible call and quote buttons on mobile.",
  },
  { kind: "contact", label: "Contact & hours", help: "Phone, email and opening hours." },
  { kind: "policy", label: "Policy text", help: "Plain policy wording, like a privacy notice." },
  {
    kind: "post_list",
    label: "Article list",
    help: "Links to every article or project page you've published.",
  },
  {
    kind: "embed",
    label: "Embedded tool",
    help: "A map, booking widget or video from a service you already use.",
  },
  { kind: "custom", label: "Your own section", help: "A heading and text you write yourself." },
];

/** Page types Revora can lay out, in plain language. */
export const PAGE_LIBRARY: { kind: PageKind; label: string; help: string }[] = [
  { kind: "home", label: "Home", help: "The main landing page with your strongest offer." },
  {
    kind: "services",
    label: "Services hub",
    help: "Every service in one place, each linking to its own page.",
  },
  {
    kind: "service",
    label: "Single service page",
    help: "One page per service — this is what ranks locally.",
  },
  {
    kind: "area",
    label: "Service area page",
    help: "One page per town or neighbourhood you cover.",
  },
  {
    kind: "pricing",
    label: "Pricing & instant quote",
    help: "Starting prices plus the quote calculator.",
  },
  { kind: "book", label: "Book online", help: "A page dedicated to taking the booking." },
  { kind: "about", label: "About", help: "Who you are and why customers trust you." },
  { kind: "reviews", label: "Reviews", help: "Published customer reviews in one place." },
  { kind: "gallery", label: "Work gallery", help: "Photos of real jobs." },
  { kind: "faq", label: "FAQ", help: "Answers that remove hesitation before calling." },
  { kind: "offers", label: "Offers", help: "Current promotions you write yourself." },
  { kind: "contact", label: "Contact", help: "Phone, email, hours and a form." },
  {
    kind: "thanks",
    label: "Thank you",
    help: "Shown after a form is sent — used for ad tracking.",
  },
  { kind: "privacy", label: "Privacy notice", help: "Required by Google Ads and Meta Ads." },
  { kind: "custom", label: "Your own page", help: "Anything else you need." },
];

export const sectionLabel = (kind: string) =>
  SECTION_LIBRARY.find((s) => s.kind === kind)?.label ?? "Section";

export const pageLabel = (kind: string) =>
  PAGE_LIBRARY.find((p) => p.kind === kind)?.label ?? "Page";

/** Fields the AI assistant and the editor are allowed to change on a section. */
export const SECTION_TEXT_FIELDS = ["heading", "subheading", "body"] as const;
export type SectionTextField = (typeof SECTION_TEXT_FIELDS)[number];

/* ------------------------------- Blueprint -------------------------------- */

export type BlueprintInput = {
  /** Workspace id — seeds this client's unique layout and wording variation. */
  organizationId?: string | null;
  businessName: string;
  industry: string | null;
  city: string | null;
  state: string | null;
  serviceArea: string | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  hasHours: boolean;
  photoCount: number;
  reviewCount: number;
  ctaLabel: string;
  services: {
    name: string;
    description?: string | null;
    price?: number | null;
    starting_price?: number | null;
  }[];
  benefits: string[];
  faqs: { question: string; answer: string }[];
};

export type BlueprintSection = {
  kind: SectionKind;
  variant?: string;
  heading?: string | null;
  subheading?: string | null;
  body?: string | null;
  /** Hidden sections are laid out but not shown until the client fills them in. */
  is_visible?: boolean;
  /** Marks a section that needs the client's own words before it can go live. */
  needs_input?: boolean;
  components?: {
    kind: string;
    label?: string | null;
    body?: string | null;
    link_url?: string | null;
    link_label?: string | null;
  }[];
};

export type BlueprintPage = {
  slug: string;
  title: string;
  kind: PageKind;
  seo_title?: string | null;
  seo_description?: string | null;
  noindex?: boolean;
  sections: BlueprintSection[];
};

const place = (input: BlueprintInput) =>
  localityLabel({ serviceArea: input.serviceArea, city: input.city, state: input.state });

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** Splits "Raleigh, Durham & Cary" into individual places for area pages. */
export function splitAreas(serviceArea: string | null, city: string | null): string[] {
  const source = serviceArea || city || "";
  const parts = source
    .split(/[,/•|]|\band\b|&/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 1 && part.length < 60);
  const unique: string[] = [];
  for (const part of parts)
    if (!unique.some((p) => p.toLowerCase() === part.toLowerCase())) unique.push(part);
  return unique.slice(0, 8);
}

/**
 * Turns supplied business information into a complete, lead-generating site:
 * every page a local business needs, each with a way to get in touch.
 * Sections without supporting data are left out or hidden rather than filled
 * with placeholder claims.
 */
export function buildContentBlueprint(input: BlueprintInput): BlueprintPage[] {
  const area = place(input);
  const name = input.businessName || "Your business";
  const trade = input.industry || "local services";
  const cta = input.ctaLabel || "Get my price";
  const areas = splitAreas(input.serviceArea, input.city);
  const services = input.services.slice(0, 12);
  // Same engine, different site: layout + wording vary per business.
  const v = siteVariation({
    organizationId: input.organizationId ?? null,
    businessName: input.businessName,
    industry: input.industry,
    city: input.city,
  });
  const headlineFacts = { name, trade, area };

  const quoteButton = { kind: "button", label: cta, link_url: "#quote" };
  const bookButton = { kind: "button", label: "Book online", link_url: "#book" };
  const callButton = input.phone
    ? { kind: "button", label: `Call ${input.phone}`, link_url: `tel:${input.phone}` }
    : null;
  const captureButtons = [quoteButton, bookButton, ...(callButton ? [callButton] : [])];

  const serviceComponents = services.map((s) => ({
    kind: "service_card",
    label: s.name,
    body: s.description ?? null,
    link_url: `/${slugify(s.name)}`,
    link_label: "See details",
  }));

  const priceComponents = services
    .filter((s) => s.price !== null && s.price !== undefined)
    .map((s) => ({
      kind: "price_row",
      label: s.name,
      body: `${s.starting_price ? "From " : ""}$${Number(s.starting_price ?? s.price)}`,
    }));

  const processSteps: BlueprintSection = {
    kind: "process",
    variant: v.id,
    heading: v.heading("process"),
    subheading: "Three steps, no phone tag.",
    components: v.processSteps.map((step) => ({
      kind: "step",
      label: step.label,
      body: step.body,
    })),
  };

  const stickyCta: BlueprintSection = {
    kind: "sticky_cta",
    heading: cta,
    subheading: input.phone ?? null,
    components: captureButtons,
  };

  const trustBits = [
    area ? `Serving ${area}` : null,
    input.reviewCount > 0 ? `${input.reviewCount} customer reviews` : null,
    input.hasHours ? "Published opening hours" : null,
    input.phone ? "Talk to a real person" : null,
  ].filter((bit): bit is string => !!bit);

  /* ------------------------------- Home page ------------------------------- */

  const home: BlueprintSection[] = [
    {
      kind: "hero",
      variant: v.heroVariant,
      heading: v.headline(headlineFacts),
      subheading: input.description
        ? (input.description.split(/(?<=\.)\s/)[0] ?? null)
        : v.subheadline(headlineFacts),
      components: captureButtons,
    },
  ];

  if (trustBits.length)
    home.push({
      kind: "trust_bar",
      heading: null,
      components: trustBits.map((bit) => ({ kind: "trust_item", label: bit })),
    });

  home.push({
    kind: "offer",
    heading: "Current offer",
    body: "Write the offer you actually want to run — for example a seasonal discount or a free inspection. This block stays hidden until you fill it in.",
    is_visible: false,
    needs_input: true,
    components: [quoteButton],
  });

  if (input.description)
    home.push({ kind: "intro", heading: v.heading("intro", { name }), body: input.description });
  if (serviceComponents.length)
    home.push({
      kind: "services",
      variant: v.serviceVariant,
      heading: v.heading("services"),
      components: serviceComponents,
    });

  // Optional proof/detail blocks appear in this business's own order.
  const optionalBlocks: Record<string, BlueprintSection | null> = {
    process: processSteps,
    benefits: input.benefits.length
      ? {
          kind: "benefits",
          heading: v.heading("benefits"),
          components: input.benefits.slice(0, 6).map((b) => ({ kind: "benefit", label: b })),
        }
      : null,
    pricing: priceComponents.length
      ? {
          kind: "pricing",
          heading: v.heading("pricing"),
          subheading: "Every job is quoted on the details you give us.",
          components: priceComponents,
        }
      : null,
    gallery: input.photoCount > 0 ? { kind: "gallery", heading: v.heading("gallery") } : null,
    reviews:
      input.reviewCount > 0
        ? { kind: "reviews", variant: v.proofVariant, heading: v.heading("reviews") }
        : null,
  };
  for (const key of v.optionalOrder) {
    const block = optionalBlocks[key];
    if (block) home.push(block);
  }
  home.push({
    kind: "guarantee",
    heading: "Our promise",
    // No body: a promise is a factual claim, so it stays empty until the owner
    // writes their own. Builder prompts for it; visitors never see instructions.
    body: null,
    is_visible: false,
    needs_input: true,
  });
  if (areas.length > 1)
    home.push({
      kind: "areas",
      heading: v.heading("areas"),
      components: areas.map((a) => ({ kind: "area_link", label: a, link_url: `/${slugify(a)}` })),
    });
  else if (area) home.push({ kind: "area", heading: `Serving ${area}` });
  if (input.faqs.length)
    home.push({
      kind: "faq",
      heading: v.heading("faq"),
      components: input.faqs
        .slice(0, 8)
        .map((f) => ({ kind: "faq_item", label: f.question, body: f.answer })),
    });
  home.push({ kind: "quote", heading: v.heading("quote"), components: [] });
  home.push({ kind: "booking", heading: v.heading("booking"), components: [] });
  home.push({
    kind: "cta",
    variant: v.ctaVariant,
    heading: v.heading("cta"),
    components: captureButtons,
  });
  if (input.phone || input.email || input.hasHours)
    home.push({ kind: "contact", heading: v.heading("contact") });
  home.push(stickyCta);

  const pages: BlueprintPage[] = [
    {
      slug: "home",
      title: "Home",
      kind: "home",
      seo_title: area ? `${name} — ${trade} in ${area}` : `${name} — ${trade}`,
      seo_description: input.description?.slice(0, 155) ?? null,
      sections: home,
    },
  ];

  /* ------------------------------- Services -------------------------------- */

  if (serviceComponents.length) {
    pages.push({
      slug: "services",
      title: "Services",
      kind: "services",
      seo_title: area ? `Services — ${name}, ${area}` : `Services — ${name}`,
      seo_description: `Everything ${name} offers${area ? ` across ${area}` : ""}, with starting prices and instant quotes.`,
      sections: [
        {
          kind: "hero",
          heading: "Our services",
          subheading: area ? `Available across ${area}` : null,
          components: captureButtons,
        },
        { kind: "services", heading: "Choose what you need", components: serviceComponents },
        ...(priceComponents.length
          ? [
              {
                kind: "pricing" as SectionKind,
                heading: "Starting prices",
                components: priceComponents,
              },
            ]
          : []),
        processSteps,
        { kind: "quote", heading: "Get your price", components: [] },
        { kind: "cta", heading: "Not sure which one you need?", components: captureButtons },
        stickyCta,
      ],
    });

    for (const service of services.slice(0, 10)) {
      pages.push({
        slug: slugify(service.name),
        title: service.name,
        kind: "service",
        seo_title: area ? `${service.name} in ${area} — ${name}` : `${service.name} — ${name}`,
        seo_description:
          service.description?.slice(0, 155) ??
          `${service.name} from ${name}${area ? ` in ${area}` : ""}. Get an instant price range.`,
        sections: [
          {
            kind: "hero",
            heading: area ? `${service.name} in ${area}` : service.name,
            subheading: service.description ?? null,
            components: captureButtons,
          },
          ...(trustBits.length
            ? [
                {
                  kind: "trust_bar" as SectionKind,
                  components: trustBits.map((bit) => ({ kind: "trust_item", label: bit })),
                },
              ]
            : []),
          {
            kind: "service_detail",
            heading: `What's included`,
            body: service.description ?? null,
            needs_input: !service.description,
            components: [
              ...(service.price !== null && service.price !== undefined
                ? [
                    {
                      kind: "price_row",
                      label: "Starting price",
                      body: `${service.starting_price ? "From " : ""}$${Number(service.starting_price ?? service.price)}`,
                    },
                  ]
                : []),
              quoteButton,
            ],
          },
          processSteps,
          ...(input.photoCount > 0
            ? [{ kind: "gallery" as SectionKind, heading: "Recent work" }]
            : []),
          ...(input.reviewCount > 0
            ? [{ kind: "reviews" as SectionKind, heading: "What customers say" }]
            : []),
          ...(input.faqs.length
            ? [
                {
                  kind: "faq" as SectionKind,
                  heading: "Common questions",
                  components: input.faqs
                    .slice(0, 5)
                    .map((f) => ({ kind: "faq_item", label: f.question, body: f.answer })),
                },
              ]
            : []),
          { kind: "quote", heading: `Price up your ${service.name.toLowerCase()}`, components: [] },
          { kind: "booking", heading: "Book it in", components: [] },
          stickyCta,
        ],
      });
    }
  }

  /* ----------------------------- Area pages -------------------------------- */

  if (areas.length > 1) {
    for (const town of areas) {
      pages.push({
        slug: slugify(town),
        title: town,
        kind: "area",
        seo_title: `${trade} in ${town} — ${name}`,
        seo_description: `${name} covers ${town}. See services, starting prices and get an instant quote.`,
        sections: [
          {
            kind: "hero",
            heading: `${trade} in ${town}`,
            subheading: input.description
              ? (input.description.split(/(?<=\.)\s/)[0] ?? null)
              : null,
            components: captureButtons,
          },
          ...(serviceComponents.length
            ? [
                {
                  kind: "services" as SectionKind,
                  heading: `What we do in ${town}`,
                  components: serviceComponents,
                },
              ]
            : []),
          ...(input.reviewCount > 0
            ? [{ kind: "reviews" as SectionKind, heading: "Local reviews" }]
            : []),
          {
            kind: "area",
            heading: `Serving ${town}`,
            body: `${name} works across ${town}${area && area !== town ? ` and the wider ${area} area` : ""}.`,
          },
          { kind: "quote", heading: `Get a ${town} price`, components: [] },
          { kind: "cta", heading: `Book ${name} in ${town}`, components: captureButtons },
          stickyCta,
        ],
      });
    }
  }

  /* ------------------------- Pricing, booking, proof ----------------------- */

  pages.push({
    slug: "pricing",
    title: "Pricing",
    kind: "pricing",
    seo_title: area ? `Pricing — ${name}, ${area}` : `Pricing — ${name}`,
    seo_description: `What ${name} charges and how to get an exact price in a couple of minutes.`,
    sections: [
      {
        kind: "hero",
        heading: "What it costs",
        subheading: "Straight answers, no sales calls.",
        components: [quoteButton],
      },
      ...(priceComponents.length
        ? [
            {
              kind: "pricing" as SectionKind,
              heading: "Starting prices",
              components: priceComponents,
            },
          ]
        : []),
      { kind: "quote", heading: "Get your instant price range", components: [] },
      ...(input.faqs.length
        ? [
            {
              kind: "faq" as SectionKind,
              heading: "Pricing questions",
              components: input.faqs
                .slice(0, 6)
                .map((f) => ({ kind: "faq_item", label: f.question, body: f.answer })),
            },
          ]
        : []),
      stickyCta,
    ],
  });

  pages.push({
    slug: "book",
    title: "Book online",
    kind: "book",
    seo_title: `Book ${name}${area ? ` — ${area}` : ""}`,
    seo_description: `Pick a service and a time that suits you. ${name} confirms quickly.`,
    sections: [
      {
        kind: "hero",
        heading: `Book ${name}`,
        subheading: "Pick a service and a time — we confirm quickly.",
        components: [bookButton],
      },
      { kind: "booking", heading: "Choose your slot", components: [] },
      processSteps,
      ...(input.reviewCount > 0
        ? [{ kind: "reviews" as SectionKind, heading: "What customers say" }]
        : []),
      stickyCta,
    ],
  });

  if (input.description)
    pages.push({
      slug: "about",
      title: "About",
      kind: "about",
      seo_title: `About ${name}`,
      seo_description: input.description.slice(0, 155),
      sections: [
        { kind: "hero", heading: `About ${name}`, components: captureButtons },
        { kind: "intro", body: input.description },
        ...(input.benefits.length
          ? [
              {
                kind: "benefits" as SectionKind,
                heading: "What we stand for",
                components: input.benefits.slice(0, 6).map((b) => ({ kind: "benefit", label: b })),
              },
            ]
          : []),
        ...(input.reviewCount > 0
          ? [{ kind: "reviews" as SectionKind, heading: "Customer reviews" }]
          : []),
        { kind: "cta", heading: "Work with us", components: captureButtons },
        stickyCta,
      ],
    });

  if (input.reviewCount > 0)
    pages.push({
      slug: "reviews",
      title: "Reviews",
      kind: "reviews",
      seo_title: `Reviews — ${name}`,
      seo_description: `Read what customers say about ${name}${area ? ` in ${area}` : ""}.`,
      sections: [
        { kind: "hero", heading: "Customer reviews", components: captureButtons },
        { kind: "reviews", heading: "In their words" },
        { kind: "cta", heading: "Join them", components: captureButtons },
        stickyCta,
      ],
    });

  if (input.photoCount > 0)
    pages.push({
      slug: "gallery",
      title: "Our work",
      kind: "gallery",
      seo_title: `Our work — ${name}`,
      seo_description: `Photos of recent jobs completed by ${name}${area ? ` around ${area}` : ""}.`,
      sections: [
        { kind: "hero", heading: "Recent work", components: captureButtons },
        { kind: "gallery", heading: "Photos from real jobs" },
        { kind: "cta", heading: "Want the same result?", components: captureButtons },
        stickyCta,
      ],
    });

  if (input.faqs.length)
    pages.push({
      slug: "faq",
      title: "FAQ",
      kind: "faq",
      seo_title: `FAQ — ${name}`,
      seo_description: `Answers to the questions ${name} gets asked most.`,
      sections: [
        { kind: "hero", heading: "Questions & answers", components: captureButtons },
        {
          kind: "faq",
          heading: "Frequently asked",
          components: input.faqs.map((f) => ({
            kind: "faq_item",
            label: f.question,
            body: f.answer,
          })),
        },
        { kind: "cta", heading: "Still not sure?", components: captureButtons },
        stickyCta,
      ],
    });

  /* ------------------------- Offers, contact, tracking --------------------- */

  pages.push({
    slug: "offers",
    title: "Offers",
    kind: "offers",
    seo_title: `Current offers — ${name}`,
    seo_description: `Live offers from ${name}. Written by the business, never invented.`,
    sections: [
      {
        kind: "hero",
        heading: "Current offers",
        subheading: "Write your own — this page stays hidden until you do.",
        components: [quoteButton],
      },
      {
        kind: "offer",
        heading: "Your offer headline",
        body: "Describe the offer, who it applies to and when it ends.",
        needs_input: true,
      },
      { kind: "quote", heading: "Claim it", components: [] },
      stickyCta,
    ],
  });

  pages.push({
    slug: "contact",
    title: "Contact",
    kind: "contact",
    seo_title: `Contact ${name}`,
    seo_description: `Phone, email and hours for ${name}${area ? ` in ${area}` : ""}.`,
    sections: [
      {
        kind: "hero",
        heading: "Contact us",
        subheading: area ? `Serving ${area}` : null,
        components: captureButtons,
      },
      { kind: "contact", heading: "How to reach us" },
      { kind: "quote", heading: "Prefer a written price?", components: [] },
      stickyCta,
    ],
  });

  pages.push({
    slug: "thanks",
    title: "Thank you",
    kind: "thanks",
    noindex: true,
    seo_title: `Thank you — ${name}`,
    seo_description: `Your request reached ${name}.`,
    sections: [
      {
        kind: "hero",
        heading: "Thanks — we've got it",
        subheading: input.phone
          ? `Need us sooner? Call ${input.phone}.`
          : "We'll be in touch shortly.",
        components: callButton ? [callButton] : [],
      },
      ...(input.reviewCount > 0
        ? [{ kind: "reviews" as SectionKind, heading: "While you wait" }]
        : []),
    ],
  });

  pages.push({
    slug: "privacy",
    title: "Privacy",
    kind: "privacy",
    noindex: false,
    seo_title: `Privacy notice — ${name}`,
    seo_description: `How ${name} handles the details you submit through this website.`,
    sections: [
      { kind: "hero", heading: "Privacy notice" },
      {
        kind: "policy",
        heading: "What we collect and why",
        body: [
          `When you request a quote or book a job, ${name} collects the details you enter — such as your name, contact details and job description — so we can reply and carry out the work.`,
          "We do not sell your details. We share them only with the tools we use to run the business, such as our booking and messaging systems.",
          input.email || input.phone
            ? `To ask what we hold about you, or to have it deleted, contact us${input.email ? ` at ${input.email}` : ""}${input.phone ? `${input.email ? " or" : " on"} ${input.phone}` : ""}.`
            : "To ask what we hold about you, or to have it deleted, use the contact details on this website.",
          "Review this wording with your own advisor before relying on it.",
        ].join("\n\n"),
        needs_input: true,
      },
    ],
  });

  return pages;
}

/* ---------------------------- Lead engine audit --------------------------- */

export type LeadEngineItem = {
  key: string;
  label: string;
  why: string;
  ok: boolean;
  weight: number;
  fix: string;
};

const CORE_PAGE_KINDS: {
  kind: PageKind;
  label: string;
  why: string;
  fix: string;
  weight: number;
}[] = [
  {
    kind: "home",
    label: "Home page",
    why: "Your strongest offer, above the fold.",
    fix: "Run the builder to lay out your home page.",
    weight: 3,
  },
  {
    kind: "services",
    label: "Services hub",
    why: "Lets visitors self-select what they need.",
    fix: "Add your services, then rebuild the structure.",
    weight: 2,
  },
  {
    kind: "service",
    label: "A page per service",
    why: "Single-service pages are what rank for local searches.",
    fix: "Add each service separately so it gets its own page.",
    weight: 3,
  },
  {
    kind: "area",
    label: "Service area pages",
    why: "One page per town captures 'near me' searches.",
    fix: "List the towns you cover, separated by commas.",
    weight: 2,
  },
  {
    kind: "pricing",
    label: "Pricing page",
    why: "Price transparency filters out tyre-kickers.",
    fix: "Rebuild the structure to add the pricing page.",
    weight: 2,
  },
  {
    kind: "book",
    label: "Booking page",
    why: "Gives ads and Google a place to send ready buyers.",
    fix: "Rebuild the structure to add the booking page.",
    weight: 2,
  },
  {
    kind: "reviews",
    label: "Reviews page",
    why: "Proof is the cheapest conversion lift you have.",
    fix: "Collect and publish reviews.",
    weight: 2,
  },
  {
    kind: "gallery",
    label: "Work gallery",
    why: "Photos of real jobs beat stock imagery every time.",
    fix: "Upload photos in the media library.",
    weight: 1,
  },
  {
    kind: "faq",
    label: "FAQ page",
    why: "Answers objections before someone leaves.",
    fix: "Add questions and answers in the proof step.",
    weight: 1,
  },
  {
    kind: "about",
    label: "About page",
    why: "Local buyers check who they're letting in the door.",
    fix: "Write a description of the business.",
    weight: 1,
  },
  {
    kind: "contact",
    label: "Contact page",
    why: "Phone, email and hours in one obvious place.",
    fix: "Rebuild the structure to add the contact page.",
    weight: 2,
  },
  {
    kind: "thanks",
    label: "Thank-you page",
    why: "Needed to track ad conversions properly.",
    fix: "Rebuild the structure to add the thank-you page.",
    weight: 1,
  },
  {
    kind: "privacy",
    label: "Privacy notice",
    why: "Google and Meta ads require one.",
    fix: "Rebuild the structure to add the privacy notice.",
    weight: 1,
  },
];

const CORE_SECTION_KINDS: {
  kind: SectionKind;
  label: string;
  why: string;
  fix: string;
  weight: number;
}[] = [
  {
    kind: "quote",
    label: "Instant quote form",
    why: "Turns browsers into leads without a phone call.",
    fix: "Turn on your quote calculator.",
    weight: 3,
  },
  {
    kind: "booking",
    label: "Booking form",
    why: "Captures people who already decided.",
    fix: "Make at least one service bookable.",
    weight: 3,
  },
  {
    kind: "sticky_cta",
    label: "Sticky call bar",
    why: "Most local visitors are on a phone and want to tap once.",
    fix: "Rebuild the structure to add the sticky call bar.",
    weight: 2,
  },
  {
    kind: "trust_bar",
    label: "Trust strip",
    why: "Reassurance in the first screen lifts enquiries.",
    fix: "Add your area, hours and phone number.",
    weight: 1,
  },
  {
    kind: "process",
    label: "How it works",
    why: "Removes the fear of an unknown process.",
    fix: "Rebuild the structure to add the steps.",
    weight: 1,
  },
  {
    kind: "reviews",
    label: "Reviews on key pages",
    why: "Proof next to the button converts best.",
    fix: "Publish a few reviews.",
    weight: 2,
  },
  {
    kind: "pricing",
    label: "Starting prices",
    why: "Self-qualifies visitors before they enquire.",
    fix: "Add prices to your services.",
    weight: 1,
  },
  {
    kind: "offer",
    label: "A live offer",
    why: "A reason to act today, not next month.",
    fix: "Write your offer in the offers block and show it.",
    weight: 2,
  },
  {
    kind: "guarantee",
    label: "A guarantee",
    why: "Lowers the risk of choosing you.",
    fix: "Write the promise you stand behind and show it.",
    weight: 1,
  },
  {
    kind: "gallery",
    label: "Photos of work",
    why: "Real work photos are the strongest visual proof.",
    fix: "Upload job photos.",
    weight: 1,
  },
  {
    kind: "faq",
    label: "Questions answered",
    why: "Handles objections at the point of doubt.",
    fix: "Add FAQs.",
    weight: 1,
  },
  {
    kind: "cta",
    label: "Repeated call to action",
    why: "Every page should end with the next step.",
    fix: "Rebuild the structure so each page ends with a CTA.",
    weight: 2,
  },
];

/**
 * Scores how well the current structure works as a lead-generating asset.
 * Only visible sections count — a hidden block cannot convert anyone.
 */
export function leadEngineAudit(pages: ContentPage[]): {
  items: LeadEngineItem[];
  score: number;
  missing: LeadEngineItem[];
} {
  const visiblePages = pages.filter((page) => page.is_visible);
  const pageKinds = new Set(visiblePages.map((page) => page.kind));
  const sectionKinds = new Set(
    visiblePages.flatMap((page) => page.sections.filter((s) => s.is_visible).map((s) => s.kind)),
  );

  const items: LeadEngineItem[] = [
    ...CORE_PAGE_KINDS.map((entry) => ({
      key: `page:${entry.kind}`,
      label: entry.label,
      why: entry.why,
      ok: pageKinds.has(entry.kind),
      weight: entry.weight,
      fix: entry.fix,
    })),
    ...CORE_SECTION_KINDS.map((entry) => ({
      key: `section:${entry.kind}`,
      label: entry.label,
      why: entry.why,
      ok: sectionKinds.has(entry.kind),
      weight: entry.weight,
      fix: entry.fix,
    })),
  ];

  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const earned = items.reduce((sum, item) => sum + (item.ok ? item.weight : 0), 0);
  return {
    items,
    score: total ? Math.round((earned / total) * 100) : 0,
    missing: items.filter((item) => !item.ok),
  };
}

/* ---------------------------------- QA ------------------------------------ */

export type QaCheck = {
  key: string;
  label: string;
  ok: boolean;
  severity: "blocker" | "warning";
  fix: string;
};

export type QaInput = {
  businessName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  serviceArea: string | null;
  description: string | null;
  servicesCount: number;
  pagesCount: number;
  visibleSectionsCount: number;
  metaDescription: string | null;
  headline: string | null;
  hasCopy: boolean;
  photoCount: number;
  captureCount: number;
  reviewState: string | null;
};

/**
 * Pre-launch quality assurance. Blockers must pass before the site can be
 * published — publishing never reports success until these clear.
 */
export function websiteQa(input: QaInput): {
  checks: QaCheck[];
  blockers: QaCheck[];
  passed: boolean;
} {
  const checks: QaCheck[] = [
    {
      key: "name",
      label: "Business name set",
      ok: !!input.businessName,
      severity: "blocker",
      fix: "Add your business name in step 1.",
    },
    {
      key: "contact",
      label: "A way to contact you",
      ok: !!(input.phone || input.email),
      severity: "blocker",
      fix: "Add a phone number or email in the contact step.",
    },
    {
      key: "location",
      label: "Location or service area set",
      ok: !!(input.city || input.serviceArea),
      severity: "blocker",
      fix: "Add your city or the area you cover — local search needs it.",
    },
    {
      key: "services",
      label: "At least one service listed",
      ok: input.servicesCount > 0,
      severity: "blocker",
      fix: "Add your services in step 2.",
    },
    {
      key: "structure",
      label: "Website structure generated",
      ok: input.pagesCount > 0 && input.visibleSectionsCount > 0,
      severity: "blocker",
      fix: "Run the builder so Revora can lay out your pages.",
    },
    {
      key: "headline",
      label: "Headline written",
      ok: !!input.headline,
      severity: "blocker",
      fix: "Generate or write your headline banner.",
    },
    {
      key: "capture",
      label: "Lead capture connected",
      ok: input.captureCount > 0,
      severity: "blocker",
      fix: "Turn on a quote form or bookable service so enquiries reach your CRM.",
    },
    {
      key: "meta",
      label: "Search description written",
      ok: !!input.metaDescription,
      severity: "warning",
      fix: "Add a search description so Google shows the right summary.",
    },
    {
      key: "about",
      label: "About text written",
      ok: !!input.description,
      severity: "warning",
      fix: "Describe your business in your own words — it builds trust.",
    },
    {
      key: "photos",
      label: "Photos uploaded",
      ok: input.photoCount > 0,
      severity: "warning",
      fix: "Upload photos of real work in the media library.",
    },
    {
      key: "copy",
      label: "Written content generated",
      ok: input.hasCopy,
      severity: "warning",
      fix: "Run the site engine to write your page content.",
    },
    {
      key: "approved",
      label: "You approved the website",
      ok: input.reviewState === "approved",
      severity: "blocker",
      fix: "Review your site and approve it before going live.",
    },
  ];
  const blockers = checks.filter((c) => c.severity === "blocker" && !c.ok);
  return { checks, blockers, passed: blockers.length === 0 };
}

/* ------------------------------ Wizard steps ------------------------------ */

export type WizardStepKey =
  "business" | "services" | "brand" | "contact" | "proof" | "goals" | "structure" | "launch";

export const WIZARD_STEPS: { key: WizardStepKey; title: string; help: string }[] = [
  { key: "business", title: "Your business", help: "Name, trade and what you do." },
  { key: "services", title: "Services", help: "What you sell and roughly what it costs." },
  { key: "brand", title: "Look & photos", help: "Colours, style and pictures of real work." },
  { key: "contact", title: "Contact & hours", help: "How customers reach you." },
  { key: "proof", title: "Proof", help: "Experience and credentials you actually have." },
  { key: "goals", title: "Your goal", help: "What the website should get you." },
  { key: "structure", title: "Pages & sections", help: "Revora lays out your website." },
  { key: "launch", title: "Review & launch", help: "Checks, approval and publishing." },
];

/* ---------------------------------------------------------------------------
 * Version comparison
 * ------------------------------------------------------------------------- */

export type SnapshotSection = {
  id: string;
  kind: string;
  heading: string | null;
  subheading: string | null;
  body: string | null;
  sort_order: number;
  is_visible: boolean;
};

export type SnapshotPage = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  seo_title: string | null;
  seo_description: string | null;
  sections: SnapshotSection[];
};

export type ContentSnapshot = { pages: SnapshotPage[] };

/** Compact copy of the structure, small enough to store with every version. */
export function snapshotContent(pages: ContentPage[]): ContentSnapshot {
  return {
    pages: pages.map((page) => ({
      id: page.id,
      slug: page.slug,
      title: page.title,
      kind: page.kind,
      seo_title: page.seo_title,
      seo_description: page.seo_description,
      sections: page.sections.map((section) => ({
        id: section.id,
        kind: section.kind,
        heading: section.heading,
        subheading: section.subheading,
        body: section.body,
        sort_order: section.sort_order,
        is_visible: section.is_visible,
      })),
    })),
  };
}

export function readContentSnapshot(value: unknown): ContentSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const pages = (value as { pages?: unknown }).pages;
  if (!Array.isArray(pages)) return null;
  return { pages: pages as SnapshotPage[] };
}

export type ContentDiffRow = {
  page: string;
  section: string;
  field: string;
  before: string;
  after: string;
  change: "added" | "removed" | "changed";
};

const text = (value: string | null | undefined) => (value ?? "").trim();

/** Section-by-section comparison between two saved structures. */
export function diffContent(
  before: ContentSnapshot | null,
  after: ContentSnapshot | null,
): ContentDiffRow[] {
  const rows: ContentDiffRow[] = [];
  const beforePages = before?.pages ?? [];
  const afterPages = after?.pages ?? [];
  const keyOf = (page: SnapshotPage) => page.slug || page.id;
  const beforeMap = new Map(beforePages.map((page) => [keyOf(page), page]));
  const afterMap = new Map(afterPages.map((page) => [keyOf(page), page]));

  for (const [key, afterPage] of afterMap) {
    const beforePage = beforeMap.get(key);
    const pageName = afterPage.title || afterPage.slug;

    if (!beforePage) {
      rows.push({
        page: pageName,
        section: "Page",
        field: "page",
        before: "",
        after: pageName,
        change: "added",
      });
    } else {
      for (const field of ["title", "seo_title", "seo_description"] as const) {
        if (text(beforePage[field]) !== text(afterPage[field])) {
          rows.push({
            page: pageName,
            section: "Page settings",
            field:
              field === "title"
                ? "Page name"
                : field === "seo_title"
                  ? "Search title"
                  : "Search description",
            before: text(beforePage[field]),
            after: text(afterPage[field]),
            change: "changed",
          });
        }
      }
    }

    const beforeSections = new Map(
      (beforePage?.sections ?? []).map((section) => [section.id, section]),
    );
    const afterSections = new Map(afterPage.sections.map((section) => [section.id, section]));

    for (const [id, afterSection] of afterSections) {
      const label = sectionLabel(afterSection.kind);
      const beforeSection = beforeSections.get(id);
      if (!beforeSection) {
        rows.push({
          page: pageName,
          section: label,
          field: "section",
          before: "",
          after: text(afterSection.heading) || label,
          change: "added",
        });
        continue;
      }
      for (const field of SECTION_TEXT_FIELDS) {
        if (text(beforeSection[field]) !== text(afterSection[field])) {
          rows.push({
            page: pageName,
            section: label,
            field,
            before: text(beforeSection[field]),
            after: text(afterSection[field]),
            change: "changed",
          });
        }
      }
      if (beforeSection.sort_order !== afterSection.sort_order) {
        rows.push({
          page: pageName,
          section: label,
          field: "order",
          before: `position ${beforeSection.sort_order + 1}`,
          after: `position ${afterSection.sort_order + 1}`,
          change: "changed",
        });
      }
      if (beforeSection.is_visible !== afterSection.is_visible) {
        rows.push({
          page: pageName,
          section: label,
          field: "visibility",
          before: beforeSection.is_visible ? "shown" : "hidden",
          after: afterSection.is_visible ? "shown" : "hidden",
          change: "changed",
        });
      }
    }

    for (const [id, beforeSection] of beforeSections) {
      if (!afterSections.has(id)) {
        rows.push({
          page: pageName,
          section: sectionLabel(beforeSection.kind),
          field: "section",
          before: text(beforeSection.heading) || sectionLabel(beforeSection.kind),
          after: "",
          change: "removed",
        });
      }
    }
  }

  for (const [key, beforePage] of beforeMap) {
    if (!afterMap.has(key)) {
      const pageName = beforePage.title || beforePage.slug;
      rows.push({
        page: pageName,
        section: "Page",
        field: "page",
        before: pageName,
        after: "",
        change: "removed",
      });
    }
  }

  return rows;
}

/** Pulls the structure snapshot out of a stored version row. */
export function readVersionContent(pagesValue: unknown): ContentSnapshot | null {
  if (!pagesValue || typeof pagesValue !== "object") return null;
  const content = (pagesValue as { content?: unknown }).content;
  return readContentSnapshot(content);
}
