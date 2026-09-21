/**
 * Revora Site Engine — shared, browser-safe types and scoring.
 *
 * The engine turns the information a client supplies into a website: a
 * deterministic structure (see `website-plan.ts`) plus native marketing copy.
 * Nothing here invents facts: reviews, awards, certifications,
 * guarantees, prices, addresses and history are only ever passed through from
 * what the client entered.
 */

export type GenerationStatus = "queued" | "processing" | "completed" | "failed";

export type GenerationStep = { key: string; label: string; progress: number };

/** Real backend stages — each one is written to the job as it completes. */
export const GENERATION_STEPS: GenerationStep[] = [
  { key: "business", label: "Business information analysed", progress: 8 },
  { key: "services", label: "Services organised", progress: 18 },
  { key: "brand", label: "Brand identity prepared", progress: 26 },
  { key: "analysis", label: "Customers, intent and conversion strategy analysed", progress: 38 },
  { key: "structure", label: "Website structure generated", progress: 46 },
  { key: "copy", label: "Local SEO content generated", progress: 62 },
  { key: "conversion", label: "Conversion system configured", progress: 74 },
  { key: "leads", label: "Lead capture connected", progress: 84 },
  { key: "mobile", label: "Mobile experience optimised", progress: 94 },
  { key: "ready", label: "Draft ready for browser review", progress: 100 },
];

export const stepLabel = (key: string | null | undefined) =>
  GENERATION_STEPS.find((s) => s.key === key)?.label ?? "Preparing";

/* --------------------------------- AI copy --------------------------------- */

export type SiteCopy = {
  heroHeadline: string;
  heroSubheadline: string;
  primaryCta: string;
  secondaryCta: string;
  intro: string;
  benefits: string[];
  serviceCards: { name: string; copy: string }[];
  faqs: { question: string; answer: string }[];
  areaCopy: string;
  about: string;
  metaTitle: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
};

export const EDITABLE_COPY_FIELDS: { key: keyof SiteCopy; label: string }[] = [
  { key: "heroHeadline", label: "Hero headline" },
  { key: "heroSubheadline", label: "Supporting headline" },
  { key: "primaryCta", label: "Primary button" },
  { key: "secondaryCta", label: "Secondary button" },
  { key: "intro", label: "Business introduction" },
  { key: "about", label: "About copy" },
  { key: "areaCopy", label: "Service area copy" },
  { key: "metaDescription", label: "Search description" },
];

export function readCopy(value: unknown): SiteCopy | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const copy = value as Partial<SiteCopy>;
  if (typeof copy.heroHeadline !== "string") return null;
  return {
    heroHeadline: copy.heroHeadline,
    heroSubheadline: copy.heroSubheadline ?? "",
    primaryCta: copy.primaryCta ?? "Get in touch",
    secondaryCta: copy.secondaryCta ?? "See services",
    intro: copy.intro ?? "",
    benefits: Array.isArray(copy.benefits)
      ? copy.benefits.filter((b) => typeof b === "string")
      : [],
    serviceCards: Array.isArray(copy.serviceCards) ? copy.serviceCards : [],
    faqs: Array.isArray(copy.faqs) ? copy.faqs : [],
    areaCopy: copy.areaCopy ?? "",
    about: copy.about ?? "",
    metaTitle: copy.metaTitle ?? "",
    metaDescription: copy.metaDescription ?? "",
    ogTitle: copy.ogTitle ?? copy.metaTitle ?? "",
    ogDescription: copy.ogDescription ?? copy.metaDescription ?? "",
  };
}

/* ------------------------------ Revora score ------------------------------ */

export type ScoreInput = {
  profile:
    | {
        description?: string | null;
        tagline?: string | null;
        phone?: string | null;
        email?: string | null;
        city?: string | null;
        service_area?: string | null;
        logo_url?: string | null;
        hero_image_url?: string | null;
        hours?: unknown;
        testimonials?: unknown;
      }
    | null
    | undefined;
  seo: {
    headline?: string | null;
    meta_description?: string | null;
    primary_cta_label?: string | null;
  };
  servicesCount: number;
  pricedServicesCount: number;
  mediaCount: number;
  reviewCount: number;
  socialLinks: number;
  quoteFormCount: number;
  bookableCount: number;
  hasCopy: boolean;
};

export type ScoreFactor = {
  key: string;
  label: string;
  points: number;
  max: number;
  fix: string;
  to?: string;
};

const has = (value: unknown) => typeof value === "string" && value.trim().length > 0;

/** Revora Website Score, 0–100, weighted by what actually drives customers. */
export function revoraScore(input: ScoreInput) {
  const p = input.profile;
  const hours = p?.hours && typeof p.hours === "object" ? Object.keys(p.hours).length > 0 : false;
  const testimonials = Array.isArray(p?.testimonials) ? (p?.testimonials as unknown[]).length : 0;

  const factors: ScoreFactor[] = [
    {
      key: "business",
      label: "Business information",
      points: (has(p?.description) ? 8 : 0) + (has(p?.tagline) ? 4 : 0),
      max: 12,
      fix: "Write your tagline and about paragraph.",
      to: "/app/website",
    },
    {
      key: "contact",
      label: "Contact information",
      points: (has(p?.phone) ? 8 : 0) + (has(p?.email) ? 4 : 0) + (hours ? 2 : 0),
      max: 14,
      fix: "Add your phone, email and opening hours so customers can reach you.",
      to: "/app/website",
    },
    {
      key: "services",
      label: "Services",
      points: Math.min(input.servicesCount, 4) * 3 + (input.pricedServicesCount > 0 ? 3 : 0),
      max: 15,
      fix: "List at least four services and publish a price or starting price.",
      to: "/app/services",
    },
    {
      key: "photos",
      label: "Photos",
      points: Math.min(input.mediaCount, 5) * 2 + (has(p?.logo_url) ? 2 : 0),
      max: 12,
      fix: "Upload a logo and at least five photos of your work.",
      to: "/app/website",
    },
    {
      key: "cta",
      label: "Call to action",
      points: has(input.seo.primary_cta_label) ? 8 : 0,
      max: 8,
      fix: "Set the main button label so visitors know exactly what to do.",
      to: "/app/website",
    },
    {
      key: "seo",
      label: "SEO",
      points:
        (has(input.seo.headline) ? 5 : 0) +
        (has(input.seo.meta_description) ? 5 : 0) +
        (input.hasCopy ? 2 : 0),
      max: 12,
      fix: "Generate your site copy and set a search description.",
      to: "/app/website",
    },
    {
      key: "leads",
      label: "Lead capture",
      points: (input.quoteFormCount > 0 ? 6 : 0) + (input.bookableCount > 0 ? 5 : 0),
      max: 11,
      fix: "Turn on the quote calculator and make at least one service bookable.",
      to: "/app/quotes",
    },
    {
      key: "proof",
      label: "Social proof",
      points: Math.min(input.reviewCount + testimonials, 5) * 1.5,
      max: 8,
      fix: "Collect reviews from recent customers.",
      to: "/app/leads",
    },
    {
      key: "area",
      label: "Service area",
      points: has(p?.city) || has(p?.service_area) ? 5 : 0,
      max: 5,
      fix: "Name your city and the areas you serve for local search.",
      to: "/app/website",
    },
    {
      key: "social",
      label: "Social profiles",
      points: Math.min(input.socialLinks, 3),
      max: 3,
      fix: "Link your Instagram, Facebook or Google Business Profile.",
      to: "/app/settings",
    },
  ];

  const earned = factors.reduce((sum, f) => sum + Math.min(f.points, f.max), 0);
  const total = factors.reduce((sum, f) => sum + f.max, 0);
  const score = Math.round((earned / total) * 100);
  const gaps = factors
    .filter((f) => f.points < f.max)
    .sort((a, b) => b.max - b.points - (a.max - a.points));

  return { score, factors, gaps };
}

/* --------------------------- growth recommendations --------------------------- */

export type GrowthSignal = {
  visitors: number;
  leads: number;
  bookings: number;
  callClicks: number;
  formViews: number;
};

export type Recommendation = { key: string; title: string; detail: string; to?: string };

/**
 * Recommendations from real signals only. When there isn't enough data we say
 * so rather than inventing an insight.
 */
export function growthRecommendations(
  score: ReturnType<typeof revoraScore>,
  signals: GrowthSignal,
) {
  const recs: Recommendation[] = [];

  if (signals.visitors >= 50 && signals.leads === 0) {
    recs.push({
      key: "no-leads",
      title: "Visitors aren't converting yet",
      detail: `${signals.visitors} visits and no enquiries. Strengthen your main call to action and move the quote form higher up the page.`,
      to: "/app/website",
    });
  } else if (signals.visitors >= 100 && signals.leads / signals.visitors < 0.02) {
    recs.push({
      key: "low-conversion",
      title: "Conversion rate is below 2%",
      detail: "Make the primary button clearer and make sure pricing is visible before the form.",
      to: "/app/website",
    });
  }

  if (signals.callClicks > 0 && signals.bookings === 0) {
    recs.push({
      key: "prefer-calls",
      title: "Customers prefer calling",
      detail: `${signals.callClicks} call taps and no online bookings. Consider making the phone number your primary call to action.`,
      to: "/app/website",
    });
  }

  for (const gap of score.gaps.slice(0, 3)) {
    recs.push({
      key: `gap-${gap.key}`,
      title: gap.label,
      detail: gap.fix,
      ...(gap.to ? { to: gap.to } : {}),
    });
  }

  if (!recs.length && signals.visitors < 25) {
    recs.push({
      key: "need-traffic",
      title: "Not enough traffic to advise yet",
      detail: "Share your website link and QR code. Recommendations sharpen as visits come in.",
      to: "/app/analytics",
    });
  }

  return recs.slice(0, 5);
}
