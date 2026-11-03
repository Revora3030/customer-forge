/**
 * Step-by-step onboarding journey for a client workspace.
 *
 * Pure and testable: it takes the facts already loaded on the dashboard and
 * returns an ordered plan, the exact next action, and the focus for today.
 * Nothing here writes data — the UI links to the screen that does the work.
 */

export type LocalSeoFacts = {
  city: boolean;
  serviceArea: boolean;
  hours: boolean;
  phone: boolean;
  description: boolean;
};

export type JourneyFacts = {
  /** Workspace creation timestamp — drives "day 1 / day 2 / day 3". */
  signedUpAt?: string | null;
  onboardingCompleted: boolean;
  brandingReady: boolean;
  siteGenerated: boolean;
  sitePublished: boolean;
  servicesCount: number;
  mediaCount: number;
  quoteFormCount: number;
  bookableCount: number;
  automationsCount: number;
  leadsCount: number;
  reviewsCount: number;
  analyticsCount: number;
  localSeo: LocalSeoFacts;
  setupPaid: boolean;
  domainConnected: boolean;
  now?: number;
};

export type JourneyStep = {
  key: string;
  /** Day of the plan this belongs to (1-4). */
  day: number;
  label: string;
  /** Why it matters, in the client's language. */
  why: string;
  /** The literal next action to take. */
  action: string;
  to: string;
  done: boolean;
  /** True when the whole system stays locked until this is handled. */
  gate?: boolean;
};

export type JourneyPlan = {
  steps: JourneyStep[];
  done: number;
  total: number;
  percent: number;
  /** First unfinished step — the one action to take right now. */
  next: JourneyStep | null;
  dayNumber: number;
  dayLabel: string;
  /** Today's short list: unfinished steps from today and any day before it. */
  today: JourneyStep[];
  localSeoReady: boolean;
};

const DAY_MS = 86_400_000;

export function localSeoReady(seo: LocalSeoFacts) {
  return seo.city && seo.serviceArea && seo.hours && seo.phone && seo.description;
}

const DAY_LABELS: Record<number, string> = {
  1: "Day 1 — get your site built",
  2: "Day 2 — get found locally",
  3: "Day 3 — turn visitors into booked jobs",
  4: "Launch — go live and keep your access",
};

export function onboardingJourney(facts: JourneyFacts): JourneyPlan {
  const now = facts.now ?? Date.now();
  const started = facts.signedUpAt ? new Date(facts.signedUpAt).getTime() : now;
  const elapsedDays = Number.isFinite(started)
    ? Math.floor(Math.max(0, now - started) / DAY_MS)
    : 0;
  const seoOk = localSeoReady(facts.localSeo);

  const steps: JourneyStep[] = [
    {
      key: "business_details",
      day: 1,
      label: "Answer your business questions",
      why: "Your answers auto-fill your website, quotes, booking and follow-up — you only say it once.",
      action: "Finish the guided business form",
      to: "/app/website",
      done: facts.onboardingCompleted,
    },
    {
      key: "first_site",
      day: 1,
      label: "Build your first website",
      why: "The site is the engine every lead, quote and booking runs through.",
      action: "Generate your site in the builder",
      to: "/app/website",
      done: facts.siteGenerated,
    },
    {
      key: "branding",
      day: 1,
      label: "Add your logo and brand colour",
      why: "Customers trust a site that looks like your business, not a template.",
      action: "Upload your logo and pick your colour",
      to: "/app/website",
      done: facts.brandingReady,
    },
    {
      key: "services",
      day: 2,
      label: "List your services with prices",
      why: "Priced services are what people search for and what your quote tool prices.",
      action: "Add at least one service",
      to: "/app/services",
      done: facts.servicesCount > 0,
    },
    {
      key: "local_seo",
      day: 2,
      label: "Turn on local SEO",
      why: "Your city, service area, hours, phone and description are what local search results are built from.",
      action: "Complete your local details so your site publishes local business search data",
      to: "/app/website",
      done: seoOk,
    },
    {
      key: "photos",
      day: 2,
      label: "Add real photos of your work",
      why: "Before/after and job photos lift enquiries more than any other single change.",
      action: "Upload photos in the media library",
      to: "/app/website",
      done: facts.mediaCount > 0,
    },
    {
      key: "lead_capture",
      day: 3,
      label: "Switch on instant quotes",
      why: "Visitors who get a price on the spot are far more likely to leave their details.",
      action: "Publish a quote form",
      to: "/app/quotes",
      done: facts.quoteFormCount > 0,
    },
    {
      key: "booking",
      day: 3,
      label: "Let customers book you",
      why: "A booked slot beats a phone tag chase.",
      action: "Mark a service as bookable",
      to: "/app/calendar",
      done: facts.bookableCount > 0,
    },
    {
      key: "automations",
      day: 3,
      label: "Turn on automatic follow-up",
      why: "Most jobs are lost to silence, not price. Follow-up runs without you.",
      action: "Install a follow-up automation",
      to: "/app/automations",
      done: facts.automationsCount > 0,
    },
    {
      key: "reviews",
      day: 3,
      label: "Start collecting reviews",
      why: "Reviews are the strongest local ranking and trust signal you own.",
      action: "Send your first review request",
      to: "/app/reviews",
      done: facts.reviewsCount > 0,
    },
    {
      key: "publish",
      day: 4,
      label: "Publish your website",
      why: "Nothing gets found until the site is live.",
      action: "Run the launch checks and publish",
      to: "/app/launch",
      done: facts.sitePublished,
    },
    {
      key: "domain",
      day: 4,
      label: "Connect your own domain",
      why: "Your own web address looks established and keeps your search equity.",
      action: "Add your domain, or launch on your free address first",
      to: "/app/domain",
      done: facts.domainConnected,
    },
    {
      key: "activate",
      day: 4,
      label: "Activate your Growth System",
      why: "Your free access ends — the setup payment keeps everything you built switched on.",
      action: "Complete the setup payment",
      to: "/app/billing",
      done: facts.setupPaid,
      gate: true,
    },
  ];

  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done) ?? null;
  const dayNumber = Math.min(4, Math.max(1, elapsedDays + 1));
  const today = steps.filter((s) => !s.done && s.day <= dayNumber);

  return {
    steps,
    done,
    total: steps.length,
    percent: Math.round((done / steps.length) * 100),
    next,
    dayNumber,
    dayLabel: DAY_LABELS[dayNumber] ?? DAY_LABELS[4]!,
    today: today.length > 0 ? today : next ? [next] : [],
    localSeoReady: seoOk,
  };
}
