/**
 * Revora website generation engine.
 *
 * Pure, deterministic planning: it turns the information a client provides
 * during onboarding into a website structure, headline/CTA copy and SEO
 * metadata. It NEVER invents reviews, awards, certifications, licences,
 * guarantees, locations or pricing — anything the client has not supplied is
 * returned as a marked placeholder for completion.
 */

import type { Tone } from "@/lib/domain";
import { INDUSTRIES } from "@/lib/domain";
import { slugify } from "@/lib/format";
import { formatLocality, formatServiceArea } from "@/lib/locality";

/**
 * The only Revora-owned host. A client website lives on the domain the client
 * owns; until then it is reachable at `revoragrowthsystems.com/s/<slug>`.
 * Revora-branded client subdomains do not exist and must not be reintroduced.
 */
export const REVORA_HOST = "revoragrowthsystems.com";

/** Slugs we never hand to a client site path. */
export const RESERVED_SLUGS = [
  "www",
  "app",
  "api",
  "admin",
  "auth",
  "mail",
  "cdn",
  "assets",
  "static",
  "support",
  "help",
  "docs",
  "blog",
  "status",
  "demo",
  "revora",
  "dashboard",
  "login",
  "billing",
  "s",
];

export function safeSlug(value: string, fallback = "my-business") {
  const base = slugify(value || "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!base) return fallback;
  if (RESERVED_SLUGS.includes(base)) return `${base}-business`;
  if (/^\d+$/.test(base)) return `biz-${base}`;
  return base;
}

/** The always-working Revora share address for a client website. */
export function revoraShareAddress(slug: string | null | undefined) {
  return `${REVORA_HOST}/s/${safeSlug(slug ?? "")}`;
}

/* ------------------------------ review states ------------------------------ */

export type ReviewState =
  | "onboarding"
  | "generating"
  | "ready_for_review"
  | "changes_requested"
  | "approved"
  | "domain_setup"
  | "publishing"
  | "live"
  | "suspended";

export const REVIEW_STATES: Record<
  ReviewState,
  { label: string; tone: Tone; help: string; clientAction: string | null }
> = {
  onboarding: {
    label: "Onboarding",
    tone: "neutral",
    help: "We still need your business information before the website can be assembled.",
    clientAction: "Finish your business details",
  },
  generating: {
    label: "Generating",
    tone: "info",
    help: "Revora is assembling your website from the information you provided.",
    clientAction: null,
  },
  ready_for_review: {
    label: "Ready for review",
    tone: "attention",
    help: "Your website draft is ready. Review it on desktop and mobile, then approve or request changes.",
    clientAction: "Review your website",
  },
  changes_requested: {
    label: "Changes requested",
    tone: "attention",
    help: "Your change request is with the Revora team. This is awaiting Revora review — it is not automatic.",
    clientAction: null,
  },
  approved: {
    label: "Approved",
    tone: "signal",
    help: "You approved the website. Revora runs a final quality check before publishing.",
    clientAction: "Choose your web address",
  },
  domain_setup: {
    label: "Domain setup",
    tone: "info",
    help: "You can launch on your Revora share link now, or finish connecting your own domain.",
    clientAction: "Connect a domain or launch on your Revora share link",
  },
  publishing: {
    label: "Publishing",
    tone: "info",
    help: "Revora is completing the final publish steps.",
    clientAction: null,
  },
  live: {
    label: "Live",
    tone: "signal",
    help: "Your website is live and connected to lead capture, bookings, quotes, follow-up and analytics.",
    clientAction: null,
  },
  suspended: {
    label: "Suspended",
    tone: "danger",
    help: "This website is suspended. Contact Revora to restore it.",
    clientAction: null,
  },
};

export const reviewStateMeta = (state: string | null | undefined) =>
  REVIEW_STATES[(state ?? "onboarding") as ReviewState] ?? REVIEW_STATES.onboarding;

export const REVIEW_FLOW: ReviewState[] = [
  "onboarding",
  "generating",
  "ready_for_review",
  "approved",
  "domain_setup",
  "publishing",
  "live",
];

/* --------------------------- website change requests --------------------------- */

export const REQUEST_STATUSES: { value: string; label: string; tone: Tone }[] = [
  { value: "new", label: "New", tone: "attention" },
  { value: "in_progress", label: "In progress", tone: "info" },
  { value: "waiting_client", label: "Waiting for client", tone: "neutral" },
  { value: "completed", label: "Completed", tone: "signal" },
];

export const requestStatusMeta = (status: string | null | undefined) =>
  REQUEST_STATUSES.find((s) => s.value === status) ?? REQUEST_STATUSES[0]!;

export const REQUEST_PRIORITIES: { value: string; label: string; tone: Tone }[] = [
  { value: "low", label: "Low", tone: "neutral" },
  { value: "normal", label: "Normal", tone: "info" },
  { value: "high", label: "High", tone: "danger" },
];

export const REQUEST_KINDS: { value: string; label: string }[] = [
  { value: "change", label: "Content or design change" },
  { value: "structure", label: "New page or section" },
  { value: "integration", label: "Booking, quote or CRM setup" },
  { value: "domain", label: "Domain or launch help" },
  { value: "other", label: "Something else" },
];

/* --------------------------------- generation --------------------------------- */

export type GoalKey =
  "call" | "text" | "quote" | "book" | "lead" | "visit" | "purchase" | "consult";

export const WEBSITE_GOALS: { value: GoalKey; label: string; cta: string }[] = [
  { value: "call", label: "Call us", cta: "Call now" },
  { value: "text", label: "Text us", cta: "Text us" },
  { value: "quote", label: "Request a quote", cta: "Get my quote" },
  { value: "book", label: "Book an appointment", cta: "Book now" },
  { value: "lead", label: "Submit a lead form", cta: "Get in touch" },
  { value: "visit", label: "Visit our location", cta: "Get directions" },
  { value: "purchase", label: "Purchase online", cta: "Buy now" },
  { value: "consult", label: "Request a consultation", cta: "Request a consultation" },
];

export type GenerationInput = {
  businessName: string;
  industry: string;
  description?: string | null;
  city?: string | null;
  state?: string | null;
  serviceArea?: string | null;
  phone?: string | null;
  email?: string | null;
  goals: GoalKey[];
  services: { name: string; description?: string | null; price?: number | null }[];
  photoCount: number;
  testimonialCount: number;
  hasCredentials: boolean;
  hasHours: boolean;
  socialLinks: number;
};

export type PlannedPage = {
  key: string;
  label: string;
  path: string;
  reason: string;
  core: boolean;
};

export type WebsitePlan = {
  template: string;
  pages: PlannedPage[];
  headline: string;
  subheadline: string;
  primaryCtaLabel: string;
  seoTitle: string;
  metaDescription: string;
  sections: { key: string; label: string; summary: string }[];
  faqs: { question: string; answer: string }[];
  placeholders: string[];
  generatedAt: string;
};

const templateFor = (industry: string) =>
  INDUSTRIES.find((i) => i.name === industry)?.template ?? "default";

const primaryGoal = (goals: GoalKey[]): GoalKey => goals[0] ?? "quote";

function placeName(input: GenerationInput) {
  return (
    formatLocality(input.city, input.state) || formatServiceArea(input.serviceArea ?? null)
  );
}

/** Builds the website structure and copy from real client information only. */
export function generateWebsitePlan(input: GenerationInput): WebsitePlan {
  const place = placeName(input);
  const goal = primaryGoal(input.goals);
  const goalMeta = WEBSITE_GOALS.find((g) => g.value === goal)!;
  const name = input.businessName.trim() || "Your business";
  const industry = input.industry || "Local services";
  const serviceNames = input.services.map((s) => s.name).filter(Boolean);

  const placeholders: string[] = [];
  const mark = (label: string) => {
    placeholders.push(label);
  };

  const headline = place
    ? `${industry} in ${place}, done right`
    : `${industry} you can book with confidence`;

  const subheadline =
    input.description?.trim() ||
    (place
      ? `${name} serves ${place}. See services, get a straight answer on price, and lock in a time.`
      : `${name} makes it simple to see services, get pricing and lock in a time.`);
  if (!input.description?.trim())
    mark("About paragraph — replace this generated summary with your own words");

  const pages: PlannedPage[] = [
    {
      key: "home",
      label: "Home",
      path: "/",
      reason: "Primary landing page pointed at your main goal.",
      core: true,
    },
    {
      key: "services",
      label: "Services",
      path: "/#services",
      reason: "Your service menu with what's included.",
      core: true,
    },
    {
      key: "about",
      label: "About",
      path: "/#about",
      reason: "Who you are and why customers trust you.",
      core: true,
    },
    {
      key: "contact",
      label: "Contact",
      path: "/#contact",
      reason: "Phone, email and lead form in one place.",
      core: true,
    },
  ];

  if (input.photoCount >= 3)
    pages.push({
      key: "gallery",
      label: "Gallery",
      path: "/#gallery",
      reason: `Your ${input.photoCount} photos give visual proof of your work.`,
      core: false,
    });
  else mark("Photos — add at least 3 images to unlock a gallery page");

  if (input.testimonialCount > 0)
    pages.push({
      key: "reviews",
      label: "Reviews",
      path: "/#reviews",
      reason: "Shows only the testimonials you provided.",
      core: false,
    });
  else mark("Testimonials — none provided, so no reviews page was created");

  if (input.serviceArea)
    pages.push({
      key: "areas",
      label: "Service areas",
      path: "/#areas",
      reason: "Local relevance for the areas you named.",
      core: false,
    });

  if (input.goals.includes("quote"))
    pages.push({
      key: "quote",
      label: "Request a quote",
      path: "/#quote",
      reason: "Instant estimate flow wired into your CRM.",
      core: false,
    });

  if (input.goals.includes("book"))
    pages.push({
      key: "booking",
      label: "Booking",
      path: "/#book",
      reason: "Online booking wired into your Revora calendar.",
      core: false,
    });

  if (input.goals.includes("consult"))
    pages.push({
      key: "consult",
      label: "Consultation",
      path: "/#contact",
      reason: "Consultation request form before quoting.",
      core: false,
    });

  if (input.services.some((s) => typeof s.price === "number" && s.price != null))
    pages.push({
      key: "pricing",
      label: "Pricing",
      path: "/#pricing",
      reason: "You published prices, so pricing gets its own section.",
      core: false,
    });

  if (serviceNames.length >= 4)
    pages.push({
      key: "faq",
      label: "FAQ",
      path: "/#faq",
      reason: "Answers the questions a multi-service business gets asked.",
      core: false,
    });

  if (input.hasCredentials)
    pages.push({
      key: "credentials",
      label: "Credentials",
      path: "/#about",
      reason: "Shows the credentials you supplied, exactly as supplied.",
      core: false,
    });

  const sections = [
    {
      key: "hero",
      label: "Hero",
      summary: `Headline, ${goalMeta.label.toLowerCase()} button and trust line.`,
    },
    {
      key: "services",
      label: "Services",
      summary: serviceNames.length
        ? serviceNames.slice(0, 6).join(" · ")
        : "No services added yet.",
    },
    {
      key: "proof",
      label: "Proof",
      summary:
        input.testimonialCount > 0
          ? `${input.testimonialCount} testimonial(s) you provided.`
          : "No proof supplied yet.",
    },
    {
      key: "about",
      label: "About",
      summary: place ? `Local story for ${place}.` : "Business story.",
    },
    {
      key: "cta",
      label: "Conversion block",
      summary: `Repeats your main action: ${goalMeta.cta}.`,
    },
    {
      key: "contact",
      label: "Contact",
      summary:
        input.phone || input.email
          ? "Uses your business phone and email."
          : "Needs your business phone and email.",
    },
  ];

  if (!serviceNames.length) mark("Services — add at least one service so the menu isn't empty");
  if (!input.phone) mark("Business phone — call and text buttons stay hidden until this is set");
  if (!input.email) mark("Business email — email CTA stays hidden until this is set");
  if (!input.hasHours) mark("Business hours — not set");
  if (!place) mark("City / service area — needed for local search visibility");
  if (input.socialLinks === 0) mark("Social links — none provided");

  const faqs = serviceNames.length
    ? [
        {
          question: `What areas do you serve?`,
          answer:
            input.serviceArea || place
              ? `We serve ${input.serviceArea || place}.`
              : "Answer needed: list the areas you serve.",
        },
        {
          question: `How do I get started?`,
          answer: `${goalMeta.cta} and we'll confirm the details with you.`,
        },
        {
          question: `What services do you offer?`,
          answer: `${serviceNames.slice(0, 5).join(", ")}.`,
        },
      ]
    : [];
  if (!input.serviceArea && !place) mark("FAQ answer — service area question needs a real answer");

  const seoTitle = place
    ? `${name} — ${industry} in ${place}`.slice(0, 60)
    : `${name} — ${industry}`.slice(0, 60);

  const metaDescription = (
    place
      ? `${industry} in ${place}. ${serviceNames.slice(0, 3).join(", ") || "See our services"}. ${goalMeta.cta} with ${name}.`
      : `${industry} from ${name}. ${serviceNames.slice(0, 3).join(", ") || "See our services"}. ${goalMeta.cta}.`
  ).slice(0, 158);

  return {
    template: templateFor(input.industry),
    pages,
    headline,
    subheadline,
    primaryCtaLabel: goalMeta.cta,
    seoTitle,
    metaDescription,
    sections,
    faqs,
    placeholders,
    generatedAt: new Date().toISOString(),
  };
}

/** Stored shape of the plan on website_settings.generation. */
export function readPlan(value: unknown): WebsitePlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const plan = value as Partial<WebsitePlan>;
  if (!plan.pages || !Array.isArray(plan.pages)) return null;
  return plan as WebsitePlan;
}
