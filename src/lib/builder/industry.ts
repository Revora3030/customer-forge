/**
 * REVORA INDUSTRY INTELLIGENCE ENGINE
 * MASTER 10/10 EDITION
 *
 * Deterministic, dependency-free industry intelligence for the
 * Revora free-first website builder.
 *
 * IMPORTANT:
 * This module provides strategy only.
 * It must NEVER fabricate business facts, reviews, ratings,
 * awards, licenses, certifications, guarantees, pricing,
 * locations, hours, staff credentials, or customer results.
 */

export type PrimaryAction =
  | "call"
  | "quote"
  | "book"
  | "lead"
  | "visit"
  | "consult";

export type ConversionIntensity =
  | "urgent"
  | "direct"
  | "considered"
  | "relationship";

export type VisualStyle =
  | "clean"
  | "bold"
  | "luxury"
  | "editorial"
  | "technical"
  | "natural"
  | "energetic"
  | "warm";

export type PageKind =
  | "home"
  | "services"
  | "service"
  | "about"
  | "contact"
  | "gallery"
  | "faq"
  | "pricing"
  | "areas"
  | "booking"
  | "menu"
  | "portfolio"
  | "projects"
  | "schedule"
  | "visit"
  | "custom";

export type IndustryPage = {
  kind: string;
  title: string;
  slug: string;
  why: string;
  priority?: number;
};

export type IndustryVisual = {
  primary: string;
  secondary: string;
  accent: string;
  font: string;
  backdrop: string;
  style?: VisualStyle;
  density?: "airy" | "balanced" | "dense";
  radius?: "sharp" | "soft" | "rounded";
  imageTreatment?:
    | "natural"
    | "editorial"
    | "cinematic"
    | "bright"
    | "technical";
  motion?: "subtle" | "moderate" | "energetic";
};

export type IndustrySEO = {
  qualifier: string;
  intent: string;
  patterns?: string[];
  localIntent?: boolean;
  servicePageStrategy?:
    | "strong"
    | "moderate"
    | "limited";
};

export type ConversionPlacement =
  | "hero"
  | "after_intro"
  | "after_services"
  | "after_benefits"
  | "after_process"
  | "after_trust"
  | "after_gallery"
  | "faq"
  | "footer"
  | "sticky";

export type IndustryConversion = {
  intensity: ConversionIntensity;
  primaryAction: PrimaryAction;
  secondaryActions: PrimaryAction[];
  placement: ConversionPlacement[];
  stickyMobile: boolean;
  leadForm: boolean;
};

export type IndustryPlaybook = {
  slug: string;
  label: string;
  aliases: string[];
  pages: IndustryPage[];
  homeSections: string[];
  servicePageSections: string[];
  action: PrimaryAction;
  ctaLabels: {
    primary: string;
    secondary: string;
  };
  terminology: string[];
  trust: string[];
  seo: IndustrySEO;
  visual: IndustryVisual;
  faqSeeds: string[];
  conversion: IndustryConversion;
  schemaType: string;
  servicePageExamples: string[];
  objections: string[];
  contentAngles: string[];
  visualProof: "low" | "medium" | "high";
  urgency: "none" | "situational" | "high";

  readonly [key: string]: unknown;
};

/* -------------------------------------------------------------------------- */
/* Shared architecture                                                        */
/* -------------------------------------------------------------------------- */

const URGENT_TRADE_HOME = [
  "hero",
  "trust_bar",
  "services",
  "benefits",
  "process",
  "area",
  "reviews",
  "faq",
  "cta",
  "sticky_cta",
  "contact",
];

const URGENT_TRADE_SERVICE = [
  "hero",
  "intro",
  "benefits",
  "services",
  "process",
  "faq",
  "cta",
  "contact",
];

const CONSIDERED_HOME = [
  "hero",
  "intro",
  "services",
  "benefits",
  "process",
  "gallery",
  "reviews",
  "faq",
  "cta",
  "contact",
];

const CONSIDERED_SERVICE = [
  "hero",
  "intro",
  "services",
  "benefits",
  "gallery",
  "process",
  "faq",
  "cta",
];

const PROFESSIONAL_HOME = [
  "hero",
  "trust_bar",
  "intro",
  "services",
  "benefits",
  "process",
  "case_studies",
  "faq",
  "cta",
  "contact",
];

const PROFESSIONAL_SERVICE = [
  "hero",
  "intro",
  "benefits",
  "services",
  "process",
  "faq",
  "cta",
];

const VISUAL_HOME = [
  "hero",
  "intro",
  "services",
  "gallery",
  "benefits",
  "reviews",
  "faq",
  "cta",
  "contact",
];

const VISUAL_SERVICE = [
  "hero",
  "intro",
  "services",
  "gallery",
  "benefits",
  "faq",
  "cta",
];

/* -------------------------------------------------------------------------- */
/* Shared pages                                                               */
/* -------------------------------------------------------------------------- */

const HOME_PAGE: IndustryPage = {
  kind: "home",
  title: "Home",
  slug: "",
  why: "Primary homepage and conversion destination.",
  priority: 100,
};

const LOCAL_PAGE_SET: IndustryPage[] = [
  {
    kind: "services",
    title: "Services",
    slug: "services",
    why: "Creates a clear overview of the business's main work.",
    priority: 90,
  },
  {
    kind: "about",
    title: "About",
    slug: "about",
    why: "Explains who the business is and how it works.",
    priority: 70,
  },
  {
    kind: "contact",
    title: "Contact",
    slug: "contact",
    why: "Provides a direct conversion destination.",
    priority: 100,
  },
];

/* -------------------------------------------------------------------------- */
/* Conversion profiles                                                        */
/* -------------------------------------------------------------------------- */

const URGENT_CONVERSION: IndustryConversion = {
  intensity: "urgent",
  primaryAction: "call",
  secondaryActions: ["quote", "lead"],
  placement: [
    "hero",
    "after_services",
    "after_process",
    "faq",
    "sticky",
    "footer",
  ],
  stickyMobile: true,
  leadForm: true,
};

const QUOTE_CONVERSION: IndustryConversion = {
  intensity: "direct",
  primaryAction: "quote",
  secondaryActions: ["call", "lead"],
  placement: [
    "hero",
    "after_services",
    "after_gallery",
    "faq",
    "sticky",
    "footer",
  ],
  stickyMobile: true,
  leadForm: true,
};

const BOOKING_CONVERSION: IndustryConversion = {
  intensity: "direct",
  primaryAction: "book",
  secondaryActions: ["call", "lead"],
  placement: [
    "hero",
    "after_services",
    "after_process",
    "faq",
    "sticky",
    "footer",
  ],
  stickyMobile: true,
  leadForm: true,
};

const CONSULTATION_CONVERSION: IndustryConversion = {
  intensity: "considered",
  primaryAction: "consult",
  secondaryActions: ["lead", "call"],
  placement: [
    "hero",
    "after_benefits",
    "after_process",
    "faq",
    "footer",
  ],
  stickyMobile: false,
  leadForm: true,
};

const VISIT_CONVERSION: IndustryConversion = {
  intensity: "direct",
  primaryAction: "visit",
  secondaryActions: ["book", "call"],
  placement: [
    "hero",
    "after_gallery",
    "faq",
    "footer",
  ],
  stickyMobile: true,
  leadForm: false,
};

const LEAD_CONVERSION: IndustryConversion = {
  intensity: "relationship",
  primaryAction: "lead",
  secondaryActions: ["call", "consult"],
  placement: [
    "hero",
    "after_services",
    "after_benefits",
    "faq",
    "footer",
  ],
  stickyMobile: true,
  leadForm: true,
};

function conversionFor(
  action: PrimaryAction,
): IndustryConversion {
  switch (action) {
    case "call":
      return {
        ...URGENT_CONVERSION,
        secondaryActions: [
          ...URGENT_CONVERSION.secondaryActions,
        ],
        placement: [
          ...URGENT_CONVERSION.placement,
        ],
      };

    case "quote":
      return {
        ...QUOTE_CONVERSION,
        secondaryActions: [
          ...QUOTE_CONVERSION.secondaryActions,
        ],
        placement: [
          ...QUOTE_CONVERSION.placement,
        ],
      };

    case "book":
      return {
        ...BOOKING_CONVERSION,
        secondaryActions: [
          ...BOOKING_CONVERSION.secondaryActions,
        ],
        placement: [
          ...BOOKING_CONVERSION.placement,
        ],
      };

    case "consult":
      return {
        ...CONSULTATION_CONVERSION,
        secondaryActions: [
          ...CONSULTATION_CONVERSION.secondaryActions,
        ],
        placement: [
          ...CONSULTATION_CONVERSION.placement,
        ],
      };

    case "visit":
      return {
        ...VISIT_CONVERSION,
        secondaryActions: [
          ...VISIT_CONVERSION.secondaryActions,
        ],
        placement: [
          ...VISIT_CONVERSION.placement,
        ],
      };

    case "lead":
    default:
      return {
        ...LEAD_CONVERSION,
        secondaryActions: [
          ...LEAD_CONVERSION.secondaryActions,
        ],
        placement: [
          ...LEAD_CONVERSION.placement,
        ],
      };
  }
}

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */

function clean(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalize(value: unknown): string {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedSlug(value: unknown): string {
  return normalize(value).replace(/\s+/g, "-");
}

function uniqueStrings(
  values: readonly unknown[],
): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const item = clean(value);

    if (!item) continue;

    const key = normalize(item);

    if (seen.has(key)) continue;

    seen.add(key);
    output.push(item);
  }

  return output;
}

function clonePage(
  page: IndustryPage,
): IndustryPage {
  return {
    ...page,
  };
}

function clonePages(
  pages: readonly IndustryPage[],
): IndustryPage[] {
  return pages.map(clonePage);
}

function cloneConversion(
  conversion: IndustryConversion,
): IndustryConversion {
  return {
    ...conversion,
    secondaryActions: [
      ...conversion.secondaryActions,
    ],
    placement: [
      ...conversion.placement,
    ],
  };
}

function clonePlaybook(
  industry: IndustryPlaybook,
): IndustryPlaybook {
  return {
    ...industry,
    aliases: [
      ...industry.aliases,
    ],
    pages: clonePages(industry.pages),
    homeSections: [
      ...industry.homeSections,
    ],
    servicePageSections: [
      ...industry.servicePageSections,
    ],
    ctaLabels: {
      ...industry.ctaLabels,
    },
    terminology: [
      ...industry.terminology,
    ],
    trust: [
      ...industry.trust,
    ],
    seo: {
      ...industry.seo,
      patterns: industry.seo.patterns
        ? [...industry.seo.patterns]
        : [],
    },
    visual: {
      ...industry.visual,
    },
    faqSeeds: [
      ...industry.faqSeeds,
    ],
    conversion: cloneConversion(
      industry.conversion,
    ),
    servicePageExamples: [
      ...industry.servicePageExamples,
    ],
    objections: [
      ...industry.objections,
    ],
    contentAngles: [
      ...industry.contentAngles,
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Industry factory                                                           */
/* -------------------------------------------------------------------------- */

type PlaybookOptions = {
  slug: string;
  label: string;
  aliases: string[];
  action?: PrimaryAction;
  pages?: IndustryPage[];
  homeSections?: string[];
  servicePageSections?: string[];
  ctaPrimary?: string;
  ctaSecondary?: string;
  terminology?: string[];
  trust?: string[];
  qualifier?: string;
  intent?: string;
  patterns?: string[];
  localIntent?: boolean;
  servicePageStrategy?: "strong" | "moderate" | "limited";
  primary?: string;
  secondary?: string;
  accent?: string;
  font?: string;
  backdrop?: string;
  style?: VisualStyle;
  density?: "airy" | "balanced" | "dense";
  radius?: "sharp" | "soft" | "rounded";
  imageTreatment?:
    | "natural"
    | "editorial"
    | "cinematic"
    | "bright"
    | "technical";
  motion?: "subtle" | "moderate" | "energetic";
  faqSeeds?: string[];
  schemaType?: string;
  servicePageExamples?: string[];
  objections?: string[];
  contentAngles?: string[];
  visualProof?: "low" | "medium" | "high";
  urgency?: "none" | "situational" | "high";
};

function createPlaybook(
  options: PlaybookOptions,
): IndustryPlaybook {
  const action =
    options.action ?? "lead";

  const conversion =
    conversionFor(action);

  const pages =
    options.pages?.length
      ? clonePages(options.pages)
      : [
          clonePage(HOME_PAGE),
          ...clonePages(LOCAL_PAGE_SET),
        ];

  return {
    slug: options.slug,
    label: options.label,
    aliases: uniqueStrings([
      options.label,
      ...options.aliases,
    ]),
    pages,
    homeSections: uniqueStrings(
      options.homeSections ??
        PROFESSIONAL_HOME,
    ),
    servicePageSections: uniqueStrings(
      options.servicePageSections ??
        PROFESSIONAL_SERVICE,
    ),
    action,
    ctaLabels: {
      primary:
        options.ctaPrimary ??
        "Get Started",
      secondary:
        options.ctaSecondary ??
        "Learn More",
    },
    terminology: uniqueStrings(
      options.terminology ?? [],
    ),
    trust: uniqueStrings(
      options.trust ?? [],
    ),
    seo: {
      qualifier:
        options.qualifier ??
        "",
      intent:
        options.intent ??
        "commercial",
      patterns: uniqueStrings(
        options.patterns ?? [],
      ),
      localIntent:
        options.localIntent ?? true,
      servicePageStrategy:
        options.servicePageStrategy ??
        "strong",
    },
    visual: {
      primary:
        options.primary ??
        "neutral",
      secondary:
        options.secondary ??
        "surface",
      accent:
        options.accent ??
        "accent",
      font:
        options.font ??
        "modern sans",
      backdrop:
        options.backdrop ??
        "soft",
      style:
        options.style ??
        "clean",
      density:
        options.density ??
        "balanced",
      radius:
        options.radius ??
        "soft",
      imageTreatment:
        options.imageTreatment ??
        "natural",
      motion:
        options.motion ??
        "subtle",
    },
    faqSeeds: uniqueStrings(
      options.faqSeeds ?? [],
    ),
    conversion,
    schemaType:
      options.schemaType ??
      "LocalBusiness",
    servicePageExamples:
      uniqueStrings(
        options.servicePageExamples ??
          [],
      ),
    objections: uniqueStrings(
      options.objections ?? [],
    ),
    contentAngles: uniqueStrings(
      options.contentAngles ?? [],
    ),
    visualProof:
      options.visualProof ??
      "medium",
    urgency:
      options.urgency ??
      "situational",
  };
}

/* -------------------------------------------------------------------------- */
/* Master industry library                                                    */
/* -------------------------------------------------------------------------- */

export const GENERIC_PLAYBOOK =
  createPlaybook({
    slug: "local_business",
    label: "Local Business",
    aliases: [
      "business",
      "small business",
      "local business",
      "company",
      "service business",
    ],
    action: "lead",
    homeSections: PROFESSIONAL_HOME,
    servicePageSections: PROFESSIONAL_SERVICE,
    ctaPrimary: "Get Started",
    ctaSecondary: "Learn More",
    terminology: [
      "services",
      "solutions",
      "local",
      "customers",
      "contact",
      "consultation",
    ],
    trust: [
      "clear information",
      "easy contact",
      "professional presentation",
    ],
    qualifier:
      "local",
    intent:
      "commercial local",
    patterns: [
      "[service] near me",
      "[service] in [city]",
      "[business type] near me",
      "[service] [city]",
    ],
    localIntent: true,
    servicePageStrategy: "strong",
    primary: "neutral",
    secondary: "surface",
    accent: "brand",
    font: "modern sans",
    backdrop: "soft",
    style: "clean",
    density: "balanced",
    radius: "soft",
    imageTreatment: "natural",
    motion: "subtle",
    faqSeeds: [
      "What services do you offer?",
      "How can I get started?",
      "How do I contact you?",
      "What areas do you serve?",
    ],
    schemaType: "LocalBusiness",
    servicePageExamples: [
      "Primary Service",
      "Featured Service",
      "Service Area",
    ],
    objections: [
      "What does the process look like?",
      "How do I know which service is right for me?",
      "How do I get started?",
    ],
    contentAngles: [
      "services",
      "process",
      "service area",
      "frequently asked questions",
    ],
    visualProof: "medium",
    urgency: "situational",
  });

const PLUMBER = createPlaybook({
  slug: "plumbing",
  label: "Plumbing",
  aliases: [
    "plumber",
    "plumbing",
    "plumbers",
    "plumbing company",
    "plumbing contractor",
    "drain cleaning",
    "leak repair",
  ],
  action: "call",
  homeSections: URGENT_TRADE_HOME,
  servicePageSections: URGENT_TRADE_SERVICE,
  ctaPrimary: "Request Service",
  ctaSecondary: "View Services",
  terminology: [
    "plumbing",
    "repairs",
    "leaks",
    "drains",
    "water heaters",
    "fixtures",
  ],
  trust: [
    "clear service information",
    "easy contact",
    "service-area clarity",
  ],
  qualifier: "plumbing",
  intent: "local plumbing service",
  patterns: [
    "plumber near me",
    "plumbing repair [city]",
    "emergency plumber [city]",
    "water heater repair [city]",
    "drain cleaning [city]",
  ],
  localIntent: true,
  servicePageStrategy: "strong",
  primary: "deep blue",
  secondary: "cool gray",
  accent: "high visibility",
  font: "modern sans",
  backdrop: "soft",
  style: "technical",
  density: "balanced",
  radius: "soft",
  imageTreatment: "technical",
  motion: "moderate",
  faqSeeds: [
    "What plumbing services do you offer?",
    "How do I request plumbing service?",
    "What areas do you serve?",
    "How should I handle a water leak?",
    "Do you work on water heaters?",
  ],
  schemaType: "Plumber",
  servicePageExamples: [
    "Plumbing Repair",
    "Drain Cleaning",
    "Water Heater Service",
    "Leak Detection",
  ],
  objections: [
    "How quickly can I request service?",
    "What should I do before the plumber arrives?",
    "Which plumbing service do I need?",
  ],
  contentAngles: [
    "common plumbing problems",
    "service areas",
    "repair guidance",
    "maintenance",
  ],
  visualProof: "medium",
  urgency: "high",
});

const ELECTRICIAN = createPlaybook({
  slug: "electrical",
  label: "Electrical",
  aliases: [
    "electrical",
    "electrician",
    "electricians",
    "electrical contractor",
    "electrical company",
  ],
  action: "quote",
  homeSections: URGENT_TRADE_HOME,
  servicePageSections: URGENT_TRADE_SERVICE,
  ctaPrimary: "Request a Quote",
  ctaSecondary: "View Electrical Services",
  terminology: [
    "electrical",
    "wiring",
    "lighting",
    "panels",
    "outlets",
    "installations",
  ],
  trust: [
    "clear service information",
    "professional presentation",
    "easy quote request",
  ],
  qualifier: "electrical",
  intent: "local electrical service",
  patterns: [
    "electrician near me",
    "electrician [city]",
    "electrical repair [city]",
    "electrical contractor [city]",
    "panel upgrade [city]",
  ],
  localIntent: true,
  servicePageStrategy: "strong",
  primary: "charcoal",
  secondary: "warm white",
  accent: "electric accent",
  font: "modern sans",
  backdrop: "soft",
  style: "technical",
  density: "balanced",
  radius: "soft",
  imageTreatment: "technical",
  motion: "moderate",
  faqSeeds: [
    "What electrical services do you offer?",
    "How can I request a quote?",
    "What areas do you serve?",
    "What electrical projects do you handle?",
    "When should I call an electrician?",
  ],
  schemaType: "Electrician",
  servicePageExamples: [
    "Electrical Repair",
    "Lighting Installation",
    "Panel Services",
    "Outlet and Switch Services",
  ],
  objections: [
    "How do I know which electrical service I need?",
    "How can I request a quote?",
    "What information should I provide?",
  ],
  contentAngles: [
    "electrical safety",
    "common electrical problems",
    "lighting",
    "upgrades",
    "service areas",
  ],
  visualProof: "medium",
  urgency: "high",
});

const HVAC = createPlaybook({
  slug: "hvac",
  label: "HVAC",
  aliases: [
    "heating and cooling",
    "air conditioning",
    "air conditioner",
    "ac company",
    "heating company",
    "hvac contractor",
  ],
  action: "call",
  homeSections: URGENT_TRADE_HOME,
  servicePageSections: URGENT_TRADE_SERVICE,
  ctaPrimary: "Request HVAC Service",
  ctaSecondary: "Explore Services",
  terminology: [
    "heating",
    "cooling",
    "air conditioning",
    "maintenance",
    "indoor comfort",
    "HVAC",
  ],
  trust: [
    "service clarity",
    "easy contact",
    "clear service areas",
  ],
  qualifier: "HVAC",
  intent: "local heating and cooling service",
  patterns: [
    "hvac near me",
    "ac repair [city]",
    "heating repair [city]",
    "hvac service [city]",
    "air conditioning repair [city]",
  ],
  localIntent: true,
  servicePageStrategy: "strong",
  primary: "cool blue",
  secondary: "light neutral",
  accent: "comfort accent",
  font: "modern sans",
  backdrop: "soft",
  style: "technical",
  density: "balanced",
  radius: "soft",
  imageTreatment: "technical",
  motion: "moderate",
  faqSeeds: [
    "What HVAC services do you offer?",
    "How can I request service?",
    "What areas do you serve?",
    "How often should HVAC equipment be maintained?",
    "What are common heating and cooling issues?",
  ],
  schemaType: "HVACBusiness",
  servicePageExamples: [
    "AC Repair",
    "Heating Service",
    "HVAC Maintenance",
    "Indoor Air Services",
  ],
  objections: [
    "How do I know whether I need repair or maintenance?",
    "How can I request service?",
    "What information should I provide?",
  ],
  contentAngles: [
    "seasonal maintenance",
    "comfort",
    "energy efficiency",
    "common HVAC issues",
  ],
  visualProof: "medium",
  urgency: "high",
});

const CLEANING = createPlaybook({
  slug: "cleaning",
  label: "Cleaning Service",
  aliases: [
    "cleaning",
    "cleaners",
    "cleaning company",
    "house cleaning",
    "commercial cleaning",
    "maid service",
  ],
  action: "quote",
  homeSections: CONSIDERED_HOME,
  servicePageSections: CONSIDERED_SERVICE,
  ctaPrimary: "Get a Cleaning Quote",
  ctaSecondary: "View Cleaning Services",
  terminology: [
    "cleaning",
    "home cleaning",
    "commercial cleaning",
    "deep cleaning",
    "recurring cleaning",
  ],
  trust: [
    "clear service descriptions",
    "before-and-after proof when provided",
    "easy quote request",
  ],
  qualifier: "cleaning",
  intent: "local cleaning service",
  patterns: [
    "cleaning service near me",
    "house cleaning [city]",
    "commercial cleaning [city]",
    "deep cleaning [city]",
    "maid service [city]",
  ],
  localIntent: true,
  servicePageStrategy: "strong",
  primary: "bright neutral",
  secondary: "soft surface",
  accent: "fresh accent",
  font: "modern sans",
  backdrop: "soft",
  style: "clean",
  density: "airy",
  radius: "rounded",
  imageTreatment: "bright",
  motion: "subtle",
  faqSeeds: [
    "What cleaning services do you offer?",
    "How can I request a quote?",
    "What areas do you serve?",
    "Do you offer recurring cleaning?",
    "What should I expect during the cleaning process?",
  ],
  schemaType: "LocalBusiness",
  servicePageExamples: [
    "Residential Cleaning",
    "Deep Cleaning",
    "Commercial Cleaning",
    "Recurring Cleaning",
  ],
  objections: [
    "How does the quote process work?",
    "What is included?",
    "How often can I schedule service?",
  ],
  contentAngles: [
    "cleaning checklists",
    "deep cleaning",
    "recurring service",
    "service areas",
  ],
  visualProof: "high",
  urgency: "situational",
});

const LANDSCAPING = createPlaybook({
  slug: "landscaping",
  label: "Landscaping",
  aliases: [
    "landscaper",
    "landscapers",
    "lawn care",
    "lawn service",
    "landscape company",
    "yard service",
  ],
  action: "quote",
  homeSections: CONSIDERED_HOME,
  servicePageSections: CONSIDERED_SERVICE,
  ctaPrimary: "Request a Landscape Quote",
  ctaSecondary: "View Landscaping Services",
  terminology: [
    "landscaping",
    "lawn care",
    "maintenance",
    "planting",
    "hardscaping",
    "outdoor spaces",
  ],
  trust: [
    "project photography when supplied",
    "service-area clarity",
    "clear quote path",
  ],
  qualifier: "landscaping",
  intent: "local landscaping service",
  patterns: [
    "landscaper near me",
    "landscaping [city]",
    "lawn care [city]",
    "lawn service [city]",
    "landscape design [city]",
  ],
  localIntent: true,
  servicePageStrategy: "strong",
  primary: "forest",
  secondary: "earth",
  accent: "natural accent",
  font: "modern sans",
  backdrop: "soft",
  style: "natural",
  density: "balanced",
  radius: "soft",
  imageTreatment: "natural",
  motion: "subtle",
  faqSeeds: [
    "What landscaping services do you offer?",
    "How can I request a quote?",
    "What areas do you serve?",
    "Do you provide ongoing lawn care?",
    "Can you help plan an outdoor space?",
  ],
  schemaType: "LandscapingBusiness",
  servicePageExamples: [
    "Lawn Care",
    "Landscape Design",
    "Planting",
    "Hardscaping",
  ],
  objections: [
    "How does the quote process work?",
    "Which services do I need?",
    "Do you provide ongoing maintenance?",
  ],
  contentAngles: [
    "seasonal lawn care",
    "outdoor design",
    "maintenance",
    "project inspiration",
  ],
  visualProof: "high",
  urgency: "situational",
});

const BARBER = createPlaybook({
  slug: "barber",
  label: "Barber",
  aliases: [
    "barbershop",
    "barber shop",
    "barbering",
    "hair barber",
  ],
  action: "book",
  homeSections: VISUAL_HOME,
  servicePageSections: VISUAL_SERVICE,
  ctaPrimary: "Book an Appointment",
  ctaSecondary: "View Services",
  terminology: [
    "cuts",
    "fades",
    "beard services",
    "appointments",
    "barbering",
    "grooming",
  ],
  trust: [
    "real portfolio imagery when supplied",
    "clear service menu",
    "simple booking",
  ],
  qualifier: "barber",
  intent: "local barber appointment",
  patterns: [
    "barber near me",
    "barbershop [city]",
    "fade haircut [city]",
    "barber [city]",
    "haircut [city]",
  ],
  localIntent: true,
  servicePageStrategy: "moderate",
  primary: "charcoal",
  secondary: "warm neutral",
  accent: "brand accent",
  font: "display sans",
  backdrop: "dark",
  style: "bold",
  density: "balanced",
  radius: "soft",
  imageTreatment: "cinematic",
  motion: "moderate",
  faqSeeds: [
    "What services do you offer?",
    "How can I book an appointment?",
    "What should I choose for my next cut?",
    "Where are you located?",
  ],
  schemaType: "BarberShop",
  servicePageExamples: [
    "Haircuts",
    "Fades",
    "Beard Services",
    "Grooming",
  ],
  objections: [
    "How do I book?",
    "Which service should I choose?",
    "What should I expect?",
  ],
  contentAngles: [
    "style inspiration",
    "haircut education",
    "grooming",
    "service menu",
  ],
  visualProof: "high",
  urgency: "none",
});

const SALON = createPlaybook({
  slug: "salon",
  label: "Salon",
  aliases: [
    "hair salon",
    "beauty salon",
    "salon",
    "stylist",
    "hair stylist",
  ],
  action: "book",
  homeSections: VISUAL_HOME,
  servicePageSections: VISUAL_SERVICE,
  ctaPrimary: "Book an Appointment",
  ctaSecondary: "Explore Services",
  terminology: [
    "hair",
    "styling",
    "color",
    "cuts",
    "beauty",
    "appointments",
  ],
  trust: [
    "real portfolio imagery when supplied",
    "clear service menu",
    "simple booking",
  ],
  qualifier: "salon",
  intent: "local salon appointment",
  patterns: [
    "hair salon near me",
    "hair stylist [city]",
    "salon [city]",
    "hair color [city]",
    "beauty salon [city]",
  ],
  localIntent: true,
  servicePageStrategy: "moderate",
  primary: "warm neutral",
  secondary: "soft surface",
  accent: "brand accent",
  font: "elegant sans",
  backdrop: "soft",
  style: "luxury",
  density: "airy",
  radius: "rounded",
  imageTreatment: "editorial",
  motion: "subtle",
  faqSeeds: [
    "What services do you offer?",
    "How can I book?",
    "How should I prepare for my appointment?",
    "Where are you located?",
  ],
  schemaType: "HairSalon",
  servicePageExamples: [
    "Haircuts",
    "Color",
    "Styling",
    "Treatments",
  ],
  objections: [
    "Which service should I book?",
    "How long does an appointment take?",
    "How do I prepare?",
  ],
  contentAngles: [
    "style inspiration",
    "hair care",
    "service education",
    "appointment preparation",
  ],
  visualProof: "high",
  urgency: "none",
});

const AUTO_DETAILING = createPlaybook({
  slug: "auto_detailing",
  label: "Auto Detailing",
  aliases: [
    "auto detailer",
    "car detailing",
    "auto detailing",
    "detailing service",
    "mobile detailing",
  ],
  action: "quote",
  homeSections: VISUAL_HOME,
  servicePageSections: VISUAL_SERVICE,
  ctaPrimary: "Request a Detailing Quote",
  ctaSecondary: "View Detailing Services",
  terminology: [
    "detailing",
    "paint care",
    "interior cleaning",
    "exterior detailing",
    "vehicle care",
  ],
  trust: [
    "real vehicle photography when supplied",
    "service clarity",
    "quote path",
  ],
  qualifier: "auto detailing",
  intent: "local auto detailing service",
  patterns: [
    "car detailing near me",
    "auto detailing [city]",
    "mobile detailing [city]",
    "car detailer [city]",
  ],
  localIntent: true,
  servicePageStrategy: "strong",
  primary: "black",
  secondary: "graphite",
  accent: "high contrast",
  font: "modern sans",
  backdrop: "dark",
  style: "bold",
  density: "balanced",
  radius: "soft",
  imageTreatment: "cinematic",
  motion: "moderate",
  faqSeeds: [
    "What detailing services do you offer?",
    "How can I request a quote?",
    "Do you offer mobile service?",
    "What areas do you serve?",
  ],
  schemaType: "LocalBusiness",
  servicePageExamples: [
    "Interior Detailing",
    "Exterior Detailing",
    "Paint Care",
    "Full Detail",
  ],
  objections: [
    "Which package or service do I need?",
    "How does the quote work?",
    "Do you come to the customer?",
  ],
  contentAngles: [
    "vehicle care",
    "before-and-after imagery",
    "detailing education",
    "maintenance",
  ],
  visualProof: "high",
  urgency: "none",
});

const ROOFER = createPlaybook({
  slug: "roofing",
  label: "Roofing",
  aliases: [
    "roofing",
    "roofer",
    "roofers",
    "roofing company",
    "roofing contractor",
    "roof repair",
  ],
  action: "quote",
  homeSections: URGENT_TRADE_HOME,
  servicePageSections: URGENT_TRADE_SERVICE,
  ctaPrimary: "Request a Roofing Quote",
  ctaSecondary: "View Roofing Services",
  terminology: [
    "roofing",
    "roof repair",
    "roof replacement",
    "inspection",
    "roof maintenance",
  ],
  trust: [
    "real project photography when supplied",
    "clear service information",
    "quote path",
  ],
  qualifier: "roofing",
  intent: "local roofing service",
  patterns: [
    "roofer near me",
    "roof repair [city]",
    "roof replacement [city]",
    "roofing contractor [city]",
    "roof inspection [city]",
  ],
  localIntent: true,
  servicePageStrategy: "strong",
  primary: "slate",
  secondary: "warm neutral",
  accent: "high visibility",
  font: "modern sans",
  backdrop: "soft",
  style: "technical",
  density: "balanced",
  radius: "soft",
  imageTreatment: "technical",
  motion: "moderate",
  faqSeeds: [
    "What roofing services do you offer?",
    "How can I request an estimate?",
    "What areas do you serve?",
    "When should a roof be inspected?",
  ],
  schemaType: "RoofingContractor",
  servicePageExamples: [
    "Roof Repair",
    "Roof Replacement",
    "Roof Inspection",
    "Roof Maintenance",
  ],
  objections: [
    "How do I know if my roof needs repair?",
    "How does the estimate process work?",
    "What information should I provide?",
  ],
  contentAngles: [
    "roof maintenance",
    "storm preparation",
    "roof inspection",
    "repair education",
  ],
  visualProof: "high",
  urgency: "situational",
});

const PAINTER = createPlaybook({
  slug: "painting",
  label: "Painting Contractors",
  aliases: [
    "painting",
    "painter",
    "painters",
    "painting company",
    "painting contractor",
  ],
  action: "quote",
  homeSections: CONSIDERED_HOME,
  servicePageSections: CONSIDERED_SERVICE,
  ctaPrimary: "Request a Painting Quote",
  ctaSecondary: "View Painting Services",
  terminology: [
    "painting",
    "interior painting",
    "exterior painting",
    "color",
    "surface preparation",
  ],
  trust: [
    "real project photography when supplied",
    "clear project information",
    "simple quote path",
  ],
  qualifier: "painting",
  intent: "local painting service",
  patterns: [
    "painter near me",
    "house painter [city]",
    "painting contractor [city]",
    "interior painter [city]",
    "exterior painter [city]",
  ],
  localIntent: true,
  servicePageStrategy: "strong",
  primary: "warm white",
  secondary: "neutral",
  accent: "brand accent",
  font: "modern sans",
  backdrop: "soft",
  style: "clean",
  density: "balanced",
  radius: "soft",
  imageTreatment: "bright",
  motion: "subtle",
  faqSeeds: [
    "What painting services do you offer?",
    "How can I request a quote?",
    "Do you handle interior and exterior projects?",
    "What areas do you serve?",
  ],
  schemaType: "HousePainter",
  servicePageExamples: [
    "Interior Painting",
    "Exterior Painting",
    "Cabinet Painting",
    "Surface Preparation",
  ],
  objections: [
    "How does the quote work?",
    "Which service do I need?",
    "How should I prepare the space?",
  ],
  contentAngles: [
    "color selection",
    "surface preparation",
    "project planning",
    "before-and-after proof",
  ],
  visualProof: "high",
  urgency: "none",
});

const CONSTRUCTION = createPlaybook({
  slug: "construction",
  label: "Construction",
  aliases: [
    "construction",
    "general contractor",
    "general contracting",
    "building contractor",
    "home builder",
    "builders",
  ],
  action: "quote",
  homeSections: CONSIDERED_HOME,
  servicePageSections: CONSIDERED_SERVICE,
  ctaPrimary: "Request a Construction Quote",
  ctaSecondary: "View Construction Services",
  terminology: [
    "construction",
    "remodeling",
    "new builds",
    "renovations",
    "contracting",
    "building",
  ],
  trust: [
    "clear project information",
    "real project photography when supplied",
    "quote path",
  ],
  qualifier: "construction",
  intent: "local construction service",
  patterns: [
    "general contractor near me",
    "construction [city]",
    "home builder [city]",
    "building contractor [city]",
    "remodeling contractor [city]",
  ],
  localIntent: true,
  servicePageStrategy: "strong",
  primary: "slate",
  secondary: "warm neutral",
  accent: "high visibility",
  font: "modern sans",
  backdrop: "soft",
  style: "technical",
  density: "balanced",
  radius: "soft",
  imageTreatment: "technical",
  motion: "moderate",
  faqSeeds: [
    "What construction services do you offer?",
    "How can I request a quote?",
    "Do you handle full builds and remodels?",
    "What areas do you serve?",
    "What should I prepare before a project starts?",
  ],
  schemaType: "GeneralContractor",
  servicePageExamples: [
    "New Construction",
    "Home Additions",
    "Renovations",
    "General Contracting",
  ],
  objections: [
    "How does the bidding process work?",
    "How long does a typical project take?",
    "Which project services do I need?",
  ],
  contentAngles: [
    "construction process",
    "home building",
    "renovation planning",
    "project management",
  ],
  visualProof: "high",
  urgency: "situational",
});

const REMODELING = createPlaybook({
  slug: "remodeling",
  label: "Remodeling",
  aliases: [
    "remodeling",
    "remodel",
    "remodeler",
    "renovation",
    "renovations",
    "home remodeling",
    "kitchen remodel",
    "bathroom remodel",
  ],
  action: "quote",
  homeSections: CONSIDERED_HOME,
  servicePageSections: CONSIDERED_SERVICE,
  ctaPrimary: "Request a Remodeling Quote",
  ctaSecondary: "View Remodeling Services",
  terminology: [
    "remodeling",
    "renovations",
    "kitchen remodeling",
    "bathroom remodeling",
    "home improvement",
    "interior updates",
  ],
  trust: [
    "real project photography when supplied",
    "clear scope descriptions",
    "quote path",
  ],
  qualifier: "remodeling",
  intent: "local remodeling service",
  patterns: [
    "remodeling near me",
    "home remodeling [city]",
    "kitchen remodel [city]",
    "bathroom remodel [city]",
    "renovation contractor [city]",
  ],
  localIntent: true,
  servicePageStrategy: "strong",
  primary: "warm neutral",
  secondary: "soft surface",
  accent: "brand accent",
  font: "modern sans",
  backdrop: "soft",
  style: "clean",
  density: "balanced",
  radius: "soft",
  imageTreatment: "bright",
  motion: "subtle",
  faqSeeds: [
    "What remodeling services do you offer?",
    "How can I request a quote?",
    "How long does a typical remodel take?",
    "What areas do you serve?",
  ],
  schemaType: "HomeImprovementContractor",
  servicePageExamples: [
    "Kitchen Remodeling",
    "Bathroom Remodeling",
    "Basement Finishing",
    "Room Additions",
  ],
  objections: [
    "How does the estimate work?",
    "What scope is right for my home?",
    "How long will the project take?",
  ],
  contentAngles: [
    "remodel inspiration",
    "project planning",
    "budget guidance",
    "renovation education",
  ],
  visualProof: "high",
  urgency: "situational",
});

const AUTOMOTIVE = createPlaybook({
  slug: "automotive",
  label: "Automotive",
  aliases: [
    "automotive",
    "auto repair",
    "car repair",
    "mechanic",
    "mechanics",
    "auto shop",
    "car service",
    "vehicle service",
  ],
  action: "quote",
  homeSections: CONSIDERED_HOME,
  servicePageSections: CONSIDERED_SERVICE,
  ctaPrimary: "Request a Service Quote",
  ctaSecondary: "View Auto Services",
  terminology: [
    "auto repair",
    "maintenance",
    "diagnostics",
    "tire service",
    "brakes",
    "vehicle service",
  ],
  trust: [
    "clear service descriptions",
    "real shop photography when supplied",
    "quote path",
  ],
  qualifier: "automotive",
  intent: "local automotive service",
  patterns: [
    "auto repair near me",
    "mechanic [city]",
    "car repair [city]",
    "auto shop [city]",
    "brake service [city]",
  ],
  localIntent: true,
  servicePageStrategy: "strong",
  primary: "graphite",
  secondary: "clean neutral",
  accent: "high visibility",
  font: "modern sans",
  backdrop: "soft",
  style: "technical",
  density: "balanced",
  radius: "soft",
  imageTreatment: "technical",
  motion: "moderate",
  faqSeeds: [
    "What auto services do you offer?",
    "How can I request a quote?",
    "Do you handle routine maintenance?",
    "What areas do you serve?",
  ],
  schemaType: "AutoRepair",
  servicePageExamples: [
    "Brake Service",
    "Oil Changes",
    "Tire Service",
    "Diagnostics",
  ],
  objections: [
    "How do I know which service I need?",
    "How does the quote process work?",
    "How long will the service take?",
  ],
  contentAngles: [
    "vehicle maintenance",
    "common car problems",
    "service education",
    "shop process",
  ],
  visualProof: "medium",
  urgency: "situational",
});

const REAL_ESTATE = createPlaybook({
  slug: "real_estate",
  label: "Real Estate",
  aliases: [
    "real estate",
    "realtor",
    "realtors",
    "real estate agent",
    "real estate agency",
    "realty",
    "property agent",
    "estate agent",
  ],
  action: "lead",
  homeSections: PROFESSIONAL_HOME,
  servicePageSections: PROFESSIONAL_SERVICE,
  ctaPrimary: "Contact an Agent",
  ctaSecondary: "View Listings",
  terminology: [
    "listings",
    "buying",
    "selling",
    "real estate",
    "properties",
    "neighborhoods",
  ],
  trust: [
    "clear service areas",
    "professional presentation",
    "easy contact path",
  ],
  qualifier: "real estate",
  intent: "local real estate service",
  patterns: [
    "real estate agent near me",
    "realtor [city]",
    "real estate [city]",
    "sell my home [city]",
    "buy a home [city]",
  ],
  localIntent: true,
  servicePageStrategy: "moderate",
  primary: "navy",
  secondary: "clean neutral",
  accent: "brand accent",
  font: "elegant sans",
  backdrop: "soft",
  style: "clean",
  density: "airy",
  radius: "soft",
  imageTreatment: "editorial",
  motion: "subtle",
  faqSeeds: [
    "What areas do you serve?",
    "How does selling a home work?",
    "How can I get in touch?",
    "Do you have current listings?",
    "How should I prepare to sell?",
  ],
  schemaType: "RealEstateAgent",
  servicePageExamples: [
    "Home Buying",
    "Home Selling",
    "Listings",
    "Market Guidance",
  ],
  objections: [
    "How does the buying process work?",
    "How does the selling process work?",
    "Which areas do you cover?",
  ],
  contentAngles: [
    "neighborhood guides",
    "buying guidance",
    "selling guidance",
    "market clarity",
  ],
  visualProof: "low",
  urgency: "none",
});

const LEGAL = createPlaybook({
  slug: "legal",
  label: "Legal",
  aliases: [
    "legal",
    "law firm",
    "lawyer",
    "lawyers",
    "attorney",
    "attorneys",
    "solicitor",
    "law office",
    "legal services",
  ],
  action: "consult",
  homeSections: PROFESSIONAL_HOME,
  servicePageSections: PROFESSIONAL_SERVICE,
  ctaPrimary: "Book a Consultation",
  ctaSecondary: "View Practice Areas",
  terminology: [
    "legal",
    "consultation",
    "practice areas",
    "legal advice",
    "case review",
    "counsel",
  ],
  trust: [
    "clear practice areas",
    "professional presentation",
    "direct consultation path",
  ],
  qualifier: "legal",
  intent: "local legal consultation",
  patterns: [
    "lawyer near me",
    "law firm [city]",
    "attorney [city]",
    "solicitor [city]",
    "legal advice [city]",
  ],
  localIntent: true,
  servicePageStrategy: "strong",
  primary: "deep blue",
  secondary: "clean neutral",
  accent: "gold accent",
  font: "elegant sans",
  backdrop: "soft",
  style: "editorial",
  density: "airy",
  radius: "sharp",
  imageTreatment: "editorial",
  motion: "subtle",
  faqSeeds: [
    "What practice areas do you cover?",
    "How can I book a consultation?",
    "What should I bring to a consultation?",
    "Where are you located?",
  ],
  schemaType: "LegalService",
  servicePageExamples: [
    "Consultations",
    "Case Review",
    "Practice Areas",
    "Legal Guidance",
  ],
  objections: [
    "How does the consultation work?",
    "Which practice area covers my case?",
    "What should I prepare?",
  ],
  contentAngles: [
    "practice area education",
    "legal process",
    "consultation preparation",
    "service clarity",
  ],
  visualProof: "low",
  urgency: "situational",
});

const MEDICAL = createPlaybook({
  slug: "medical",
  label: "Medical",
  aliases: [
    "medical",
    "clinic",
    "doctor",
    "doctors",
    "physician",
    "medical practice",
    "healthcare",
    "primary care",
  ],
  action: "book",
  homeSections: PROFESSIONAL_HOME,
  servicePageSections: PROFESSIONAL_SERVICE,
  ctaPrimary: "Book a Visit",
  ctaSecondary: "View Services",
  terminology: [
    "medical",
    "primary care",
    "appointments",
    "healthcare",
    "patient care",
  ],
  trust: [
    "clear service information",
    "professional presentation",
    "simple booking path",
  ],
  qualifier: "medical",
  intent: "local medical practice",
  patterns: [
    "doctor near me",
    "clinic [city]",
    "primary care [city]",
    "medical practice [city]",
    "physician [city]",
  ],
  localIntent: true,
  servicePageStrategy: "strong",
  primary: "teal",
  secondary: "clean neutral",
  accent: "calm accent",
  font: "modern sans",
  backdrop: "soft",
  style: "clean",
  density: "airy",
  radius: "rounded",
  imageTreatment: "bright",
  motion: "subtle",
  faqSeeds: [
    "What services does the practice offer?",
    "How can I book an appointment?",
    "What should I bring to my visit?",
    "Where are you located?",
  ],
  schemaType: "MedicalClinic",
  servicePageExamples: [
    "Primary Care",
    "Appointments",
    "Preventive Care",
    "Patient Services",
  ],
  objections: [
    "How do I book an appointment?",
    "Which provider should I see?",
    "What should I prepare for my visit?",
  ],
  contentAngles: [
    "patient care",
    "visit preparation",
    "service education",
    "practice clarity",
  ],
  visualProof: "low",
  urgency: "none",
});

const DENTAL = createPlaybook({
  slug: "dental",
  label: "Dental",
  aliases: [
    "dental",
    "dentist",
    "dentists",
    "dental clinic",
    "dental practice",
    "dentistry",
  ],
  action: "book",
  homeSections: PROFESSIONAL_HOME,
  servicePageSections: PROFESSIONAL_SERVICE,
  ctaPrimary: "Book an Appointment",
  ctaSecondary: "View Dental Services",
  terminology: [
    "dental",
    "dentistry",
    "checkups",
    "cleanings",
    "appointments",
    "oral health",
  ],
  trust: [
    "clear service information",
    "professional presentation",
    "simple booking path",
  ],
  qualifier: "dental",
  intent: "local dental practice",
  patterns: [
    "dentist near me",
    "dental clinic [city]",
    "dentist [city]",
    "dental practice [city]",
    "teeth cleaning [city]",
  ],
  localIntent: true,
  servicePageStrategy: "strong",
  primary: "soft teal",
  secondary: "clean neutral",
  accent: "fresh accent",
  font: "modern sans",
  backdrop: "soft",
  style: "clean",
  density: "airy",
  radius: "rounded",
  imageTreatment: "bright",
  motion: "subtle",
  faqSeeds: [
    "What dental services do you offer?",
    "How can I book an appointment?",
    "How often should I come in?",
    "Where are you located?",
  ],
  schemaType: "Dentist",
  servicePageExamples: [
    "Checkups",
    "Cleanings",
    "Restorative Care",
    "Cosmetic Dentistry",
  ],
  objections: [
    "How do I book?",
    "Which service do I need?",
    "How should I prepare for my visit?",
  ],
  contentAngles: [
    "oral health",
    "preventive care",
    "visit education",
    "service menu",
  ],
  visualProof: "low",
  urgency: "none",
});

const RESTAURANT = createPlaybook({
  slug: "restaurant",
  label: "Restaurant",
  aliases: [
    "restaurant",
    "cafe",
    "caf\u00e9",
    "diner",
    "bistro",
    "eatery",
  ],
  action: "visit",
  homeSections: VISUAL_HOME,
  servicePageSections: VISUAL_SERVICE,
  ctaPrimary: "Visit Us",
  ctaSecondary: "View the Menu",
  terminology: [
    "menu",
    "dining",
    "reservations",
    "hours",
    "location",
    "cuisine",
  ],
  trust: [
    "clear menu",
    "real photography when supplied",
    "hours and location clarity",
  ],
  qualifier: "restaurant",
  intent: "local restaurant visit",
  patterns: [
    "restaurant near me",
    "cafe [city]",
    "diner [city]",
    "bistro [city]",
    "eat near me",
  ],
  localIntent: true,
  servicePageStrategy: "moderate",
  primary: "warm earth",
  secondary: "cream surface",
  accent: "appetite accent",
  font: "display serif",
  backdrop: "soft",
  style: "warm",
  density: "airy",
  radius: "rounded",
  imageTreatment: "editorial",
  motion: "subtle",
  faqSeeds: [
    "What are your hours?",
    "Where are you located?",
    "Do you take reservations?",
    "What do you serve?",
    "Is there parking?",
  ],
  schemaType: "Restaurant",
  servicePageExamples: [
    "Menu",
    "Hours",
    "Location",
    "Reservations",
  ],
  objections: [
    "What are your hours?",
    "Where are you located?",
    "How do I visit or order?",
  ],
  contentAngles: [
    "menu highlights",
    "location and hours",
    "dining experience",
    "reservations",
  ],
  visualProof: "medium",
  urgency: "none",
});

const BEAUTY = createPlaybook({
  slug: "beauty",
  label: "Beauty",
  aliases: [
    "beauty",
    "beauty salon",
    "beauty bar",
    "spa",
    "nail salon",
    "nails",
    "esthetics",
    "beauty studio",
  ],
  action: "book",
  homeSections: VISUAL_HOME,
  servicePageSections: VISUAL_SERVICE,
  ctaPrimary: "Book an Appointment",
  ctaSecondary: "Explore Services",
  terminology: [
    "beauty",
    "nails",
    "spa",
    "treatments",
    "appointments",
    "esthetics",
  ],
  trust: [
    "real portfolio imagery when supplied",
    "clear service menu",
    "simple booking",
  ],
  qualifier: "beauty",
  intent: "local beauty appointment",
  patterns: [
    "beauty salon near me",
    "nail salon [city]",
    "spa [city]",
    "esthetics [city]",
    "beauty bar [city]",
  ],
  localIntent: true,
  servicePageStrategy: "moderate",
  primary: "blush",
  secondary: "soft surface",
  accent: "brand accent",
  font: "elegant sans",
  backdrop: "soft",
  style: "luxury",
  density: "airy",
  radius: "rounded",
  imageTreatment: "editorial",
  motion: "subtle",
  faqSeeds: [
    "What services do you offer?",
    "How can I book?",
    "How should I prepare for my appointment?",
    "Where are you located?",
  ],
  schemaType: "BeautySalon",
  servicePageExamples: [
    "Nails",
    "Spa Treatments",
    "Facials",
    "Waxing",
  ],
  objections: [
    "Which service should I book?",
    "How long does an appointment take?",
    "How do I prepare?",
  ],
  contentAngles: [
    "service menu",
    "self-care education",
    "appointment preparation",
    "before-and-after proof",
  ],
  visualProof: "high",
  urgency: "none",
});

const FITNESS = createPlaybook({
  slug: "fitness",
  label: "Fitness",
  aliases: [
    "fitness",
    "gym",
    "personal trainer",
    "trainer",
    "workouts",
    "fitness studio",
    "crossfit",
    "yoga studio",
  ],
  action: "lead",
  homeSections: PROFESSIONAL_HOME,
  servicePageSections: PROFESSIONAL_SERVICE,
  ctaPrimary: "Start Today",
  ctaSecondary: "Explore Training",
  terminology: [
    "fitness",
    "training",
    "workouts",
    "classes",
    "coaching",
    "memberships",
  ],
  trust: [
    "clear program information",
    "real photography when supplied",
    "easy start path",
  ],
  qualifier: "fitness",
  intent: "local fitness training",
  patterns: [
    "gym near me",
    "personal trainer [city]",
    "fitness studio [city]",
    "workout classes [city]",
    "yoga [city]",
  ],
  localIntent: true,
  servicePageStrategy: "strong",
  primary: "graphite",
  secondary: "clean neutral",
  accent: "energy accent",
  font: "modern sans",
  backdrop: "soft",
  style: "energetic",
  density: "balanced",
  radius: "sharp",
  imageTreatment: "bright",
  motion: "energetic",
  faqSeeds: [
    "What programs do you offer?",
    "How can I get started?",
    "Do you offer personal training?",
    "What should I bring to a session?",
    "Where are you located?",
  ],
  schemaType: "HealthClub",
  servicePageExamples: [
    "Personal Training",
    "Group Classes",
    "Coaching",
    "Memberships",
  ],
  objections: [
    "How do I start?",
    "Which program fits me?",
    "What should I bring?",
  ],
  contentAngles: [
    "fitness education",
    "training programs",
    "class schedules",
    "getting started",
  ],
  visualProof: "medium",
  urgency: "none",
});

const PROFESSIONAL_SERVICES = createPlaybook({
  slug: "professional_services",
  label: "Professional Services",
  aliases: [
    "professional services",
    "consultant",
    "consulting",
    "business services",
    "accounting",
    "accountant",
    "bookkeeping",
    "financial advisor",
    "insurance agent",
    "business consultant",
  ],
  action: "consult",
  homeSections: PROFESSIONAL_HOME,
  servicePageSections: PROFESSIONAL_SERVICE,
  ctaPrimary: "Book a Consultation",
  ctaSecondary: "View Services",
  terminology: [
    "consulting",
    "advisory",
    "professional services",
    "strategy",
    "solutions",
  ],
  trust: [
    "clear service lines",
    "professional presentation",
    "direct consultation path",
  ],
  qualifier: "professional services",
  intent: "local professional services",
  patterns: [
    "consultant near me",
    "accountant [city]",
    "business consultant [city]",
    "financial advisor [city]",
    "insurance agent [city]",
  ],
  localIntent: true,
  servicePageStrategy: "moderate",
  primary: "navy",
  secondary: "clean neutral",
  accent: "brand accent",
  font: "elegant sans",
  backdrop: "soft",
  style: "editorial",
  density: "airy",
  radius: "sharp",
  imageTreatment: "editorial",
  motion: "subtle",
  faqSeeds: [
    "What services do you offer?",
    "How can I book a consultation?",
    "Which service fits my needs?",
    "Where are you located?",
  ],
  schemaType: "ProfessionalService",
  servicePageExamples: [
    "Consulting",
    "Advisory",
    "Business Services",
    "Specialist Services",
  ],
  objections: [
    "How does the consultation work?",
    "Which service do I need?",
    "What should I prepare?",
  ],
  contentAngles: [
    "service lines",
    "consultation education",
    "client process",
    "specialty clarity",
  ],
  visualProof: "low",
  urgency: "none",
});

const HOME_SERVICES = createPlaybook({
  slug: "home_services",
  label: "Home Services",
  aliases: [
    "home services",
    "handyman",
    "home improvement",
    "home maintenance",
    "handyman services",
    "property maintenance",
  ],
  action: "quote",
  homeSections: CONSIDERED_HOME,
  servicePageSections: CONSIDERED_SERVICE,
  ctaPrimary: "Request a Quote",
  ctaSecondary: "View Home Services",
  terminology: [
    "home services",
    "handyman",
    "maintenance",
    "repairs",
    "home improvement",
    "odd jobs",
  ],
  trust: [
    "clear service descriptions",
    "simple quote path",
    "service-area clarity",
  ],
  qualifier: "home services",
  intent: "local home services",
  patterns: [
    "handyman near me",
    "home services [city]",
    "home maintenance [city]",
    "handyman [city]",
    "property maintenance [city]",
  ],
  localIntent: true,
  servicePageStrategy: "strong",
  primary: "warm neutral",
  secondary: "soft surface",
  accent: "brand accent",
  font: "modern sans",
  backdrop: "soft",
  style: "clean",
  density: "balanced",
  radius: "soft",
  imageTreatment: "bright",
  motion: "subtle",
  faqSeeds: [
    "What home services do you offer?",
    "How can I request a quote?",
    "What areas do you serve?",
    "Can you handle small repairs?",
  ],
  schemaType: "HomeServices",
  servicePageExamples: [
    "Handyman Services",
    "Home Repairs",
    "Maintenance",
    "Home Improvement",
  ],
  objections: [
    "Which service do I need?",
    "How does the quote work?",
    "What areas do you cover?",
  ],
  contentAngles: [
    "home maintenance",
    "repair guidance",
    "service areas",
    "project readiness",
  ],
  visualProof: "medium",
  urgency: "situational",
});

const PRESSURE_WASHING = createPlaybook({
  slug: "pressure_washing",
  label: "Pressure Washing",
  aliases: [
    "pressure washing",
    "power washing",
    "power washer",
    "pressure washer",
  ],
  action: "quote",
  homeSections: CONSIDERED_HOME,
  servicePageSections: CONSIDERED_SERVICE,
  ctaPrimary: "Request a Quote",
  ctaSecondary: "View Services",
  terminology: [
    "pressure washing",
    "power washing",
    "driveways",
    "siding",
    "decks",
    "exterior cleaning",
  ],
  trust: [
    "real project imagery when supplied",
    "clear service descriptions",
    "easy quote request",
  ],
  qualifier: "pressure washing",
  intent: "local pressure washing service",
  patterns: [
    "pressure washing near me",
    "power washing [city]",
    "pressure washing [city]",
    "driveway cleaning [city]",
    "house washing [city]",
  ],
  localIntent: true,
  servicePageStrategy: "strong",
  primary: "deep blue",
  secondary: "clean neutral",
  accent: "fresh accent",
  font: "modern sans",
  backdrop: "soft",
  style: "energetic",
  density: "balanced",
  radius: "soft",
  imageTreatment: "bright",
  motion: "moderate",
  faqSeeds: [
    "What pressure washing services do you offer?",
    "How can I request a quote?",
    "What areas do you serve?",
    "Can you clean driveways and siding?",
  ],
  schemaType: "LocalBusiness",
  servicePageExamples: [
    "House Washing",
    "Driveway Cleaning",
    "Deck Cleaning",
    "Exterior Cleaning",
  ],
  objections: [
    "Which surfaces can be cleaned?",
    "How does the quote process work?",
    "What should I prepare?",
  ],
  contentAngles: [
    "exterior maintenance",
    "surface care",
    "before-and-after proof",
    "seasonal cleaning",
  ],
  visualProof: "high",
  urgency: "none",
});

const PET_CARE = createPlaybook({
  slug: "pet_care",
  label: "Pet Care",
  aliases: ["pet grooming", "dog groomer", "cat groomer", "pet care", "veterinarian", "veterinary", "animal clinic", "pet boarding", "dog daycare"],
  action: "book",
  homeSections: VISUAL_HOME,
  servicePageSections: VISUAL_SERVICE,
  ctaPrimary: "Book an Appointment",
  ctaSecondary: "Explore Services",
  terminology: ["pet care", "grooming", "appointments", "dogs", "cats", "boarding"],
  trust: ["clear care information", "real pet photography when supplied", "simple booking"],
  qualifier: "pet care",
  intent: "local pet care appointment",
  patterns: ["pet groomer near me", "dog grooming [city]", "veterinarian [city]", "pet boarding [city]"],
  localIntent: true,
  servicePageStrategy: "strong",
  primary: "warm ink",
  secondary: "soft cream",
  accent: "playful brand accent",
  font: "friendly editorial sans",
  backdrop: "soft",
  style: "editorial",
  density: "airy",
  radius: "rounded",
  imageTreatment: "bright",
  motion: "subtle",
  faqSeeds: ["What pet services do you offer?", "How can I book?", "How should I prepare my pet?", "Where are you located?"],
  schemaType: "VeterinaryCare",
  servicePageExamples: ["Pet Grooming", "Veterinary Care", "Pet Boarding", "Dog Daycare"],
  objections: ["Which service should I book?", "How should I prepare my pet?", "How long does an appointment take?"],
  contentAngles: ["care options", "appointment preparation", "service process", "pet comfort"],
  visualProof: "medium",
  urgency: "situational",
});

const LOCKSMITH = createPlaybook({
  slug: "locksmith",
  label: "Locksmith",
  aliases: ["locksmith", "lock repair", "lock replacement", "rekey", "car keys", "access control", "safe opening"],
  action: "call",
  homeSections: URGENT_TRADE_HOME,
  servicePageSections: URGENT_TRADE_SERVICE,
  ctaPrimary: "Call for Service",
  ctaSecondary: "View Locksmith Services",
  terminology: ["locks", "keys", "rekeying", "access", "residential", "commercial"],
  trust: ["clear service scope", "direct contact path", "service-area clarity"],
  qualifier: "locksmith",
  intent: "local locksmith service",
  patterns: ["locksmith near me", "emergency locksmith [city]", "rekey service [city]", "lock repair [city]"],
  localIntent: true,
  servicePageStrategy: "strong",
  primary: "charcoal",
  secondary: "steel",
  accent: "amber signal",
  font: "bold technical sans",
  backdrop: "dark",
  style: "energetic",
  density: "balanced",
  radius: "sharp",
  imageTreatment: "editorial",
  motion: "moderate",
  faqSeeds: ["What locksmith services do you offer?", "What areas do you serve?", "How can I request service?", "Can you rekey existing locks?"],
  schemaType: "Locksmith",
  servicePageExamples: ["Lock Repair", "Rekeying", "Commercial Locksmith", "Access Control"],
  objections: ["Can you service this type of lock?", "What areas do you cover?", "How do I request help?"],
  contentAngles: ["lock options", "property access", "service preparation", "security maintenance"],
  visualProof: "medium",
  urgency: "high",
});

const SOLAR = createPlaybook({
  slug: "solar",
  label: "Solar and Energy",
  aliases: ["solar", "solar installer", "solar panels", "renewable energy", "battery storage", "ev charger"],
  action: "quote",
  homeSections: CONSIDERED_HOME,
  servicePageSections: CONSIDERED_SERVICE,
  ctaPrimary: "Request a Consultation",
  ctaSecondary: "Explore Energy Services",
  terminology: ["solar", "energy", "panels", "battery storage", "installation", "consultation"],
  trust: ["clear system information", "real installation imagery when supplied", "consultation path"],
  qualifier: "solar energy",
  intent: "local solar installation",
  patterns: ["solar installer near me", "solar panels [city]", "battery storage [city]", "ev charger installer [city]"],
  localIntent: true,
  servicePageStrategy: "strong",
  primary: "deep navy",
  secondary: "clean neutral",
  accent: "solar amber",
  font: "modern technical sans",
  backdrop: "dark",
  style: "editorial",
  density: "airy",
  radius: "sharp",
  imageTreatment: "bright",
  motion: "subtle",
  faqSeeds: ["What solar services do you offer?", "How does a consultation work?", "What areas do you serve?", "Do you offer battery or EV charging options?"],
  schemaType: "Electrician",
  servicePageExamples: ["Solar Installation", "Battery Storage", "EV Charging", "System Consultation"],
  objections: ["Which system fits my property?", "How does the consultation work?", "What information should I prepare?"],
  contentAngles: ["system options", "consultation process", "installation planning", "energy technology"],
  visualProof: "high",
  urgency: "none",
});

const MOVING_AND_REMOVAL = createPlaybook({
  slug: "moving_removal",
  label: "Moving and Removal",
  aliases: ["moving company", "movers", "moving service", "junk removal", "hauling", "furniture removal", "estate cleanout", "relocation"],
  action: "quote",
  homeSections: CONSIDERED_HOME,
  servicePageSections: CONSIDERED_SERVICE,
  ctaPrimary: "Request a Quote",
  ctaSecondary: "View Services",
  terminology: ["moving", "removal", "hauling", "packing", "relocation", "cleanout"],
  trust: ["clear service scope", "simple quote path", "service-area clarity"],
  qualifier: "moving and removal",
  intent: "local moving or removal service",
  patterns: ["movers near me", "moving company [city]", "junk removal [city]", "hauling service [city]"],
  localIntent: true,
  servicePageStrategy: "strong",
  primary: "deep blue",
  secondary: "warm neutral",
  accent: "signal orange",
  font: "confident modern sans",
  backdrop: "soft",
  style: "clean",
  density: "balanced",
  radius: "soft",
  imageTreatment: "bright",
  motion: "moderate",
  faqSeeds: ["What moving or removal services do you offer?", "How can I request a quote?", "What areas do you serve?", "What should I prepare before service?"],
  schemaType: "MovingCompany",
  servicePageExamples: ["Local Moving", "Packing", "Junk Removal", "Property Cleanouts"],
  objections: ["What items can you handle?", "How does the quote work?", "What should I prepare?"],
  contentAngles: ["service preparation", "packing guidance", "removal options", "service areas"],
  visualProof: "medium",
  urgency: "situational",
});

/* -------------------------------------------------------------------------- */
/* Master registry                                                            */
/* -------------------------------------------------------------------------- */

export const INDUSTRY_PLAYBOOKS: IndustryPlaybook[] = [
  GENERIC_PLAYBOOK,
  PLUMBER,
  ELECTRICIAN,
  HVAC,
  CLEANING,
  LANDSCAPING,
  BARBER,
  SALON,
  AUTO_DETAILING,
  ROOFER,
  PAINTER,
  CONSTRUCTION,
  REMODELING,
  AUTOMOTIVE,
  REAL_ESTATE,
  LEGAL,
  MEDICAL,
  DENTAL,
  RESTAURANT,
  BEAUTY,
  FITNESS,
  PROFESSIONAL_SERVICES,
  HOME_SERVICES,
  PRESSURE_WASHING,
  PET_CARE,
  LOCKSMITH,
  SOLAR,
  MOVING_AND_REMOVAL,
];

/* -------------------------------------------------------------------------- */
/* Detection                                                                  */
/* -------------------------------------------------------------------------- */

type IndustryMatch = {
  playbook: IndustryPlaybook;
  score: number;
};

function tokenSet(
  input: string,
): Set<string> {
  return new Set(
    normalize(input)
      .split(" ")
      .filter(Boolean),
  );
}

function scoreAlias(
  inputTokens: Set<string>,
  alias: string,
): number {
  const aliasTokens =
    tokenSet(alias);

  if (!aliasTokens.size) {
    return 0;
  }

  let matches = 0;

  for (const token of aliasTokens) {
    if (inputTokens.has(token)) {
      matches += 1;
    }
  }

  const coverage =
    matches /
    aliasTokens.size;

  if (
    normalize(alias).length >= 5 &&
    normalize(
      Array.from(inputTokens).join(" "),
    ).includes(
      normalize(alias),
    )
  ) {
    return Math.max(
      coverage,
      0.95,
    );
  }

  return coverage;
}

function rankIndustry(
  input: string,
  industry: IndustryPlaybook,
): number {
  const normalized =
    normalize(input);

  if (!normalized) {
    return 0;
  }

  const tokens =
    tokenSet(input);

  let score = 0;

  for (const alias of industry.aliases) {
    const aliasScore =
      scoreAlias(
        tokens,
        alias,
      );

    score = Math.max(
      score,
      aliasScore,
    );
  }

  for (const pattern of industry.seo.patterns ?? []) {
    const patternTokens =
      normalize(pattern)
        .split(" ")
        .filter(
          (token) =>
            token !== "near" &&
            token !== "me" &&
            token !== "in",
        );

    if (!patternTokens.length) {
      continue;
    }

    const matched =
      patternTokens.filter(
        (token) =>
          tokens.has(token),
      ).length;

    score = Math.max(
      score,
      matched /
        patternTokens.length *
        0.85,
    );
  }

  if (
    normalized.includes(
      normalize(industry.label),
    )
  ) {
    score = Math.max(
      score,
      1,
    );
  }

  return Math.min(
    1,
    score,
  );
}

/**
 * Returns the strongest industry match.
 */
export function matchIndustry(
  ...hints: (
    | string
    | null
    | undefined
  )[]
): IndustryMatch {
  const input =
    hints
      .map(clean)
      .filter(Boolean)
      .join(" ");

  let best: IndustryMatch = {
    playbook:
      GENERIC_PLAYBOOK,
    score: 0,
  };

  for (const industry of INDUSTRY_PLAYBOOKS) {
    if (
      industry.slug ===
      "local_business"
    ) {
      continue;
    }

    const score =
      rankIndustry(
        input,
        industry,
      );

    if (
      score >
      best.score
    ) {
      best = {
        playbook:
          industry,
        score,
      };
    }
  }

  return best;
}

/**
 * Returns an industry playbook.
 *
 * The generic fallback is used when the request is too vague.
 */
export function playbookFor(
  ...hints: (
    | string
    | null
    | undefined
  )[]
): IndustryPlaybook {
  const match =
    matchIndustry(
      ...hints,
    );

  if (
    match.score <
    0.45
  ) {
    return clonePlaybook(
      GENERIC_PLAYBOOK,
    );
  }

  return clonePlaybook(
    match.playbook,
  );
}

/**
 * Backward-compatible alias used by older builder integrations.
 */
export function getIndustryPlaybook(
  ...hints: (
    | string
    | null
    | undefined
  )[]
): IndustryPlaybook {
  return playbookFor(
    ...hints,
  );
}

/**
 * Returns a confidence level for the detected industry.
 */
export function industryConfidence(
  ...hints: (
    | string
    | null
    | undefined
  )[]
): "low" | "medium" | "high" {
  const match =
    matchIndustry(
      ...hints,
    );

  if (
    match.score >=
    0.85
  ) {
    return "high";
  }

  if (
    match.score >=
    0.6
  ) {
    return "medium";
  }

  return "low";
}

/**
 * Returns the top ranked industry candidates.
 */
export function rankIndustries(
  hints: (
    | string
    | null
    | undefined
  )[],
  limit = 5,
): IndustryMatch[] {
  const input =
    hints
      .map(clean)
      .filter(Boolean)
      .join(" ");

  const matches =
    INDUSTRY_PLAYBOOKS
      .filter(
        (industry) =>
          industry.slug !==
          "local_business",
      )
      .map(
        (industry) => ({
          playbook:
            clonePlaybook(
              industry,
            ),
          score:
            rankIndustry(
              input,
              industry,
            ),
        }),
      )
      .sort(
        (a, b) =>
          b.score -
          a.score,
      );

  const safeLimit =
    Number.isFinite(limit)
      ? Math.max(
          1,
          Math.min(
            Math.floor(limit),
            20,
          ),
        )
      : 5;

  return matches.slice(
    0,
    safeLimit,
  );
}

/* -------------------------------------------------------------------------- */
/* Strategy helpers                                                           */
/* -------------------------------------------------------------------------- */

export function pagesFor(
  industry: IndustryPlaybook,
): IndustryPage[] {
  return clonePages(
    industry.pages,
  ).sort(
    (a, b) =>
      (b.priority ?? 0) -
      (a.priority ?? 0),
  );
}

export function homeSectionsFor(
  industry: IndustryPlaybook,
): string[] {
  return uniqueStrings(
    industry.homeSections,
  );
}

export function servicePageSectionsFor(
  industry: IndustryPlaybook,
): string[] {
  return uniqueStrings(
    industry.servicePageSections,
  );
}

export function terminologyFor(
  industry: IndustryPlaybook,
): string[] {
  return uniqueStrings(
    industry.terminology,
  );
}

export function trustSignalsFor(
  industry: IndustryPlaybook,
): string[] {
  return uniqueStrings(
    industry.trust,
  );
}

export function faqSeedsFor(
  industry: IndustryPlaybook,
  limit = 8,
): string[] {
  const safeLimit =
    Number.isFinite(limit)
      ? Math.max(
          1,
          Math.min(
            Math.floor(limit),
            20,
          ),
        )
      : 8;

  return uniqueStrings(
    industry.faqSeeds,
  ).slice(
    0,
    safeLimit,
  );
}

export function servicePageExamplesFor(
  industry: IndustryPlaybook,
  limit = 8,
): string[] {
  const safeLimit =
    Number.isFinite(limit)
      ? Math.max(
          1,
          Math.min(
            Math.floor(limit),
            20,
          ),
        )
      : 8;

  return uniqueStrings(
    industry.servicePageExamples,
  ).slice(
    0,
    safeLimit,
  );
}

export function objectionsFor(
  industry: IndustryPlaybook,
  limit = 8,
): string[] {
  const safeLimit =
    Number.isFinite(limit)
      ? Math.max(
          1,
          Math.min(
            Math.floor(limit),
            20,
          ),
        )
      : 8;

  return uniqueStrings(
    industry.objections,
  ).slice(
    0,
    safeLimit,
  );
}

export function contentAnglesFor(
  industry: IndustryPlaybook,
  limit = 8,
): string[] {
  const safeLimit =
    Number.isFinite(limit)
      ? Math.max(
          1,
          Math.min(
            Math.floor(limit),
            20,
          ),
        )
      : 8;

  return uniqueStrings(
    industry.contentAngles,
  ).slice(
    0,
    safeLimit,
  );
}

/* -------------------------------------------------------------------------- */
/* Visual strategy helpers                                                    */
/* -------------------------------------------------------------------------- */

export function visualDirectionFor(
  industry: IndustryPlaybook,
): IndustryVisual {
  return {
    ...industry.visual,
  };
}

export function visualProofLevelFor(
  industry: IndustryPlaybook,
):
  | "low"
  | "medium"
  | "high" {
  return industry.visualProof;
}

/* -------------------------------------------------------------------------- */
/* SEO helpers                                                                */
/* -------------------------------------------------------------------------- */

export function seoStrategyFor(
  industry: IndustryPlaybook,
): IndustrySEO {
  return {
    ...industry.seo,
    patterns:
      industry.seo.patterns
        ? [
            ...industry.seo.patterns,
          ]
        : [],
  };
}

export function searchPatternsFor(
  industry: IndustryPlaybook,
  limit = 10,
): string[] {
  const patterns =
    industry.seo.patterns ??
    [];

  const safeLimit =
    Number.isFinite(limit)
      ? Math.max(
          1,
          Math.min(
            Math.floor(limit),
            30,
          ),
        )
      : 10;

  return uniqueStrings(
    patterns,
  ).slice(
    0,
    safeLimit,
  );
}

/* -------------------------------------------------------------------------- */
/* Schema intelligence                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Safe schema.org type helper.
 *
 * Kept deterministic and string-based so the builder does not depend
 * on a schema package at runtime.
 */
export function schemaTypeFor(
  industry: IndustryPlaybook,
): string {
  const value =
    clean(industry.schemaType);

  return value ||
    "LocalBusiness";
}

/**
 * Backward-compatible schema helper that accepts either an industry
 * playbook or an industry hint.
 */
export function schemaTypeForIndustry(
  industryOrHint:
    | IndustryPlaybook
    | string
    | null
    | undefined,
): string {
  if (
    typeof industryOrHint ===
    "object" &&
    industryOrHint !== null
  ) {
    return schemaTypeFor(
      industryOrHint,
    );
  }

  return schemaTypeFor(
    playbookFor(
      industryOrHint,
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Action intelligence                                                        */
/* -------------------------------------------------------------------------- */

export function conversionPathFor(
  industry: IndustryPlaybook,
): PrimaryAction[] {
  return uniqueStrings([
    industry.conversion.primaryAction,
    ...industry.conversion.secondaryActions,
  ]) as PrimaryAction[];
}

export function fallbackActions(
  industry: IndustryPlaybook,
): PrimaryAction[] {
  return [
    industry.conversion.primaryAction,
    ...industry.conversion.secondaryActions,
  ].filter(
    (action, index, values) =>
      values.indexOf(action) ===
      index,
  );
}

export function conversionPlacementFor(
  industry: IndustryPlaybook,
): ConversionPlacement[] {
  return Array.from(
    new Set(
      industry.conversion.placement,
    ),
  );
}

export function urgencyLevelFor(
  industry: IndustryPlaybook,
):
  | "none"
  | "situational"
  | "high" {
  return industry.urgency;
}

/* -------------------------------------------------------------------------- */
/* Safe industry detection                                                    */
/* -------------------------------------------------------------------------- */

export function detectConfidentIndustry(
  ...hints: (
    | string
    | null
    | undefined
  )[]
): IndustryPlaybook {
  const confidence =
    industryConfidence(
      ...hints,
    );

  const result =
    playbookFor(
      ...hints,
    );

  if (
    result ===
    GENERIC_PLAYBOOK
  ) {
    return GENERIC_PLAYBOOK;
  }

  if (
    confidence ===
    "low"
  ) {
    return clonePlaybook(
      GENERIC_PLAYBOOK,
    );
  }

  return result;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export function validatePlaybook(
  industry: IndustryPlaybook,
): string[] {
  const issues: string[] = [];

  if (
    !industry.slug?.trim()
  ) {
    issues.push(
      "missing slug",
    );
  }

  if (
    !industry.label?.trim()
  ) {
    issues.push(
      "missing label",
    );
  }

  if (
    !Array.isArray(
      industry.aliases,
    ) ||
    !industry.aliases.length
  ) {
    issues.push(
      "missing aliases",
    );
  }

  if (
    !Array.isArray(
      industry.pages,
    ) ||
    !industry.pages.length
  ) {
    issues.push(
      "missing pages",
    );
  }

  if (
    !Array.isArray(
      industry.homeSections,
    ) ||
    !industry.homeSections.length
  ) {
    issues.push(
      "missing home sections",
    );
  }

  if (
    !Array.isArray(
      industry.servicePageSections,
    ) ||
    !industry.servicePageSections.length
  ) {
    issues.push(
      "missing service page sections",
    );
  }

  if (
    !industry.ctaLabels?.primary?.trim()
  ) {
    issues.push(
      "missing primary CTA",
    );
  }

  if (
    !industry.ctaLabels?.secondary?.trim()
  ) {
    issues.push(
      "missing secondary CTA",
    );
  }

  if (
    !Array.isArray(
      industry.terminology,
    ) ||
    !industry.terminology.length
  ) {
    issues.push(
      "missing terminology",
    );
  }

  if (
    !Array.isArray(
      industry.faqSeeds,
    ) ||
    !industry.faqSeeds.length
  ) {
    issues.push(
      "missing FAQ seeds",
    );
  }

  if (
    !industry.schemaType?.trim()
  ) {
    issues.push(
      "missing schema type",
    );
  }

  if (
    !industry.visual?.primary?.trim()
  ) {
    issues.push(
      "missing primary visual token",
    );
  }

  if (
    !industry.visual?.secondary?.trim()
  ) {
    issues.push(
      "missing secondary visual token",
    );
  }

  if (
    !industry.visual?.accent?.trim()
  ) {
    issues.push(
      "missing accent visual token",
    );
  }

  if (
    !industry.conversion
  ) {
    issues.push(
      "missing conversion strategy",
    );
  } else {
    if (
      !industry.conversion
        .primaryAction
    ) {
      issues.push(
        "missing conversion action",
      );
    }

    if (
      !Array.isArray(
        industry.conversion
          .secondaryActions,
      )
    ) {
      issues.push(
        "invalid secondary actions",
      );
    }

    if (
      !Array.isArray(
        industry.conversion
          .placement,
      )
    ) {
      issues.push(
        "invalid CTA placement",
      );
    }
  }

  return issues;
}

/* -------------------------------------------------------------------------- */
/* Database validation                                                        */
/* -------------------------------------------------------------------------- */

export function validateIndustryLibrary(): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  const seenSlugs =
    new Set<string>();

  for (
    const industry of INDUSTRY_PLAYBOOKS
  ) {
    const slug =
      industry.slug.trim();

    if (
      seenSlugs.has(slug)
    ) {
      issues.push(
        `duplicate industry slug: ${slug}`,
      );
    }

    seenSlugs.add(slug);

    for (
      const issue of validatePlaybook(
        industry,
      )
    ) {
      issues.push(
        `${slug}: ${issue}`,
      );
    }

    const pageSlugs =
      new Set<string>();

    for (
      const page of industry.pages
    ) {
      const key =
        normalizedSlug(
          page.slug ||
            page.title,
        ) || "home";

      if (
        pageSlugs.has(key)
      ) {
        issues.push(
          `${slug}: duplicate page slug: ${key}`,
        );
      }

      pageSlugs.add(key);
    }
  }

  if (
    !seenSlugs.has(
      "local_business",
    )
  ) {
    issues.push(
      "missing local_business fallback",
    );
  }

  return {
    valid:
      issues.length === 0,
    issues,
  };
}

/* -------------------------------------------------------------------------- */
/* Diagnostics                                                                */
/* -------------------------------------------------------------------------- */

export function industryEngineHealth(): {
  industryCount: number;
  hasGenericFallback: boolean;
  duplicateSlugs: string[];
  invalidIndustries: string[];
  valid: boolean;
} {
  const duplicateSlugs: string[] = [];
  const invalidIndustries: string[] = [];
  const seen =
    new Set<string>();

  for (
    const industry of INDUSTRY_PLAYBOOKS
  ) {
    if (
      seen.has(industry.slug)
    ) {
      duplicateSlugs.push(
        industry.slug,
      );
    }

    seen.add(
      industry.slug,
    );

    if (
      validatePlaybook(
        industry,
      ).length
    ) {
      invalidIndustries.push(
        industry.slug,
      );
    }
  }

  const hasGenericFallback =
    Boolean(
      INDUSTRY_PLAYBOOKS.find(
        (industry) =>
          industry.slug ===
          "local_business",
      ),
    );

  return {
    industryCount:
      INDUSTRY_PLAYBOOKS.length,
    hasGenericFallback,
    duplicateSlugs:
      uniqueStrings(
        duplicateSlugs,
      ),
    invalidIndustries:
      uniqueStrings(
        invalidIndustries,
      ),
    valid:
      duplicateSlugs.length ===
        0 &&
      invalidIndustries.length ===
        0 &&
      hasGenericFallback,
  };
}

/* -------------------------------------------------------------------------- */
/* Public diagnostics                                                         */
/* -------------------------------------------------------------------------- */

export function industrySummary(): {
  industryCount: number;
  industries: string[];
  healthy: boolean;
} {
  const health =
    industryEngineHealth();

  return {
    industryCount:
      health.industryCount,
    industries:
      INDUSTRY_PLAYBOOKS.map(
        (industry) =>
          industry.slug,
      ),
    healthy:
      health.valid,
  };
}

/* -------------------------------------------------------------------------- */
/* End                                                                        */
/* -------------------------------------------------------------------------- */