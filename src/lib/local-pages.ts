/**
 * Programmatic local landing pages: one page per (industry × US state).
 *
 * Every fact on these pages is derived from verifiable public geography
 * (`US_STATES` metros) and Revora's own immutable offer (`GROWTH_SYSTEM`).
 * Nothing is invented — no fake statistics, no fake reviews, no claimed
 * physical offices. Revora is a remote service-area business, so the copy
 * always says "serves", never "located in".
 *
 * These pages exist to earn organic search traffic for the searches local
 * business owners actually type ("hvac website design texas", "plumber lead
 * generation ohio"), and every one of them links back into the real product.
 */

import { INDUSTRIES, industrySlug } from "@/lib/domain";
import { US_STATES, findState, type UsState } from "@/lib/us-states";
import { GROWTH_SYSTEM, usdExact } from "@/lib/offer";

export interface LocalIndustry {
  slug: string;
  /** Display name, e.g. "HVAC". */
  name: string;
  /** How an owner in this trade describes themselves. */
  owner: string;
  /** What their customer is searching for. */
  searcher: string;
  /** The concrete jobs this trade quotes. */
  jobs: readonly string[];
  /** Why leads leak in this trade specifically. */
  leak: string;
  /** What the instant quote asks for in this trade. */
  quoteInputs: readonly string[];
}

const PROFILES: Record<string, Omit<LocalIndustry, "slug" | "name">> = {
  "auto-detailing": {
    owner: "detailer",
    searcher: "car owners searching for mobile detailing near them",
    jobs: [
      "interior deep clean",
      "exterior paint correction",
      "ceramic coating",
      "fleet detailing",
    ],
    leak: "most enquiries arrive while you are mid-detail with wet hands, and a missed text is a booked competitor",
    quoteInputs: ["vehicle size", "condition", "interior or exterior", "add-ons like pet hair"],
  },
  "hair-stylists": {
    owner: "stylist",
    searcher: "clients searching for a stylist who has an opening this week",
    jobs: ["cut and style", "color and highlights", "extensions", "bridal and event styling"],
    leak: "DMs and comments get buried, so a new client books whoever answers first",
    quoteInputs: ["service", "hair length", "current color", "preferred stylist"],
  },
  barbers: {
    owner: "barber",
    searcher: "people searching for a barber with a same-day chair open",
    jobs: ["cut", "beard trim", "line-up", "kids' cuts"],
    leak: "walk-in traffic is unpredictable and no-shows eat the chair time you cannot resell",
    quoteInputs: ["service", "barber preference", "day and time"],
  },
  landscaping: {
    owner: "landscaper",
    searcher: "homeowners searching for lawn care and landscaping quotes",
    jobs: ["weekly maintenance", "cleanups", "mulch and beds", "sod and hardscape"],
    leak: "estimates require driving to the property, so slow quotes lose to whoever priced it same day",
    quoteInputs: ["property size", "service frequency", "yard condition", "add-ons"],
  },
  "pressure-washing": {
    owner: "pressure washing owner",
    searcher: "homeowners searching for house, driveway and roof washing",
    jobs: ["house wash", "driveway and concrete", "roof soft wash", "deck and fence"],
    leak: "pricing is square-footage math that is easy to automate but slow to do by phone",
    quoteInputs: ["surface type", "approximate square footage", "stories", "access"],
  },
  cleaning: {
    owner: "cleaning company owner",
    searcher: "households and offices searching for recurring cleaning",
    jobs: ["standard clean", "deep clean", "move in/out", "recurring commercial"],
    leak: "recurring revenue depends on fast replies and reliable scheduling, not on being the cheapest",
    quoteInputs: ["bedrooms and bathrooms", "square footage", "frequency", "add-ons"],
  },
  contractors: {
    owner: "contractor",
    searcher: "property owners searching for a licensed contractor for a specific project",
    jobs: ["remodels", "repairs", "additions", "commercial build-outs"],
    leak: "high-ticket buyers compare three bids, and the slowest, least organised bid loses",
    quoteInputs: ["project type", "scope", "timeline", "budget range"],
  },
  hvac: {
    owner: "HVAC contractor",
    searcher: "homeowners searching for AC or heating repair, often urgently",
    jobs: ["no-cool and no-heat calls", "system replacement", "maintenance plans", "ductwork"],
    leak: "emergency calls go to whoever picks up, so every unanswered ring is revenue gone",
    quoteInputs: ["system type", "age", "symptom", "urgency"],
  },
  plumbing: {
    owner: "plumber",
    searcher: "homeowners searching for a plumber right now",
    jobs: ["leaks and repairs", "water heaters", "drain clearing", "repipes and remodels"],
    leak: "urgent jobs are won in minutes, and after-hours calls are usually lost entirely",
    quoteInputs: ["problem", "fixture", "property age", "urgency"],
  },
  roofing: {
    owner: "roofer",
    searcher: "homeowners searching after a leak, storm or inspection",
    jobs: ["repairs", "full replacement", "storm and hail claims", "gutters"],
    leak: "one job is worth thousands, so a slow or unprofessional first impression is expensive",
    quoteInputs: ["roof type", "approximate size", "age", "damage or storm claim"],
  },
  beauty: {
    owner: "salon or studio owner",
    searcher: "clients searching for lashes, nails, brows and skin services",
    jobs: ["lashes", "nails", "brows and waxing", "facials"],
    leak: "bookings happen on a phone at night, when nobody is answering the DM",
    quoteInputs: ["service", "first visit or fill", "preferred provider", "day and time"],
  },
  "med-spa": {
    owner: "med spa owner",
    searcher: "clients researching injectables, skin and body treatments",
    jobs: ["injectables", "laser and skin", "body contouring", "memberships"],
    leak: "high-consideration buyers need consultations booked before they cool off",
    quoteInputs: ["treatment interest", "first visit", "concerns", "preferred time"],
  },
  fitness: {
    owner: "gym or trainer",
    searcher: "people searching for a trainer, class or gym trial",
    jobs: ["personal training", "group classes", "memberships", "challenges"],
    leak: "trial interest dies without an immediate reply and a booked first session",
    quoteInputs: ["goal", "experience", "training preference", "availability"],
  },
  "home-services": {
    owner: "home services owner",
    searcher: "homeowners searching for a specific fix around the house",
    jobs: ["handyman work", "installs", "seasonal maintenance", "small repairs"],
    leak: "small jobs stack up only when quoting and scheduling take seconds, not evenings",
    quoteInputs: ["job type", "scope", "access", "preferred date"],
  },
};

/** Industries that get a programmatic local page, joined to the profile copy. */
export const LOCAL_INDUSTRIES: readonly LocalIndustry[] = INDUSTRIES.flatMap<LocalIndustry>(
  (industry) => {
    const slug = industrySlug(industry.name);
    const profile = PROFILES[slug];
    if (!profile) return [];
    return [{ slug, name: industry.name as string, ...profile }];
  },
);

export function findLocalIndustry(slug: string): LocalIndustry | null {
  return LOCAL_INDUSTRIES.find((i) => i.slug === slug) ?? null;
}

export function localPath(industry: string, state?: string) {
  return state ? `/local/${industry}/${state}` : `/local/${industry}`;
}

/** Every programmatic local URL, for the sitemap. */
export function localPaths(): string[] {
  const paths: string[] = ["/local"];
  for (const industry of LOCAL_INDUSTRIES) {
    paths.push(localPath(industry.slug));
    for (const state of US_STATES) paths.push(localPath(industry.slug, state.slug));
  }
  return paths;
}

export interface LocalPageContent {
  industry: LocalIndustry;
  state: UsState;
  title: string;
  description: string;
  heading: string;
  intro: string;
  metroLine: string;
  sections: { title: string; body: string }[];
  faqs: { q: string; a: string }[];
  path: string;
}

const SETUP = usdExact(GROWTH_SYSTEM.setupPrice);
const MONTHLY = usdExact(GROWTH_SYSTEM.monthlyPrice);

/** Builds the grounded copy for one industry × state page. */
export function localPageContent(
  industrySlugValue: string,
  stateSlug: string,
): LocalPageContent | null {
  const industry = findLocalIndustry(industrySlugValue);
  const state = findState(stateSlug);
  if (!industry || !state) return null;

  const metros = state.metros;
  const metroList = metros.join(", ");
  const topMetros = metros.slice(0, 3).join(", ");
  const path = localPath(industry.slug, state.slug);
  const lowerName = industry.name.toLowerCase();

  return {
    industry,
    state,
    path,
    title: `${industry.name} websites & lead generation in ${state.name} — Revora`,
    description: `Revora builds ${state.name} ${lowerName} businesses a complete customer acquisition system: website, instant quotes, online booking, CRM and automatic follow-up. Serving ${topMetros} and every ${state.code} community. ${SETUP} setup, first month free, then ${MONTHLY}/month. Cancel anytime.`,
    heading: `${industry.name} growth system for ${state.name}`,
    intro: `If you run a ${lowerName} business in ${state.name}, your next customer is already searching. Revora gives you the whole system that turns that search into a booked job — a fast local website, instant quotes, online booking, a CRM that holds every lead, and follow-up that runs while you work.`,
    metroLine: `Serving ${metroList} and every community across ${state.name} (${state.code}) — Revora works remotely, so there is no travel or install day.`,
    sections: [
      {
        title: `Built for how ${state.name} ${lowerName} customers actually search`,
        body: `Your pages are written for ${industry.searcher}. Each service you offer — ${industry.jobs.join(", ")} — gets real content, local service-area data and structured business information, so search engines and AI assistants can tell exactly what you do and where you do it. Pages load fast on a phone, because that is where nearly every local search happens.`,
      },
      {
        title: "Instant quotes instead of phone tag",
        body: `Visitors answer a few short questions (${industry.quoteInputs.join(", ")}) and immediately see a realistic price range you control. You receive a qualified lead with the details already filled in — no back-and-forth before you know whether the job is worth driving to.`,
      },
      {
        title: "Never lose a lead again",
        body: `In ${lowerName}, ${industry.leak}. Revora answers instantly with an automatic first reply, drops every call, form, quote and booking into one pipeline, and keeps following up on a schedule until the customer replies or books.`,
      },
      {
        title: `Reviews and repeat work across ${state.name}`,
        body: `After each completed job, a review request goes out automatically, so your local proof keeps compounding in ${topMetros} and everywhere else you work. Past customers get seasonal reminders, which is the cheapest revenue any ${lowerName} business has.`,
      },
      {
        title: "You own it, and you can see what pays",
        body: `The website, the customer list and the data are yours. Analytics tie every lead and booked job back to the page, city and channel that produced it, so you know what is worth repeating instead of guessing.`,
      },
    ],
    faqs: [
      {
        q: `Do you work with ${lowerName} businesses outside the big ${state.name} metros?`,
        a: `Yes. Revora is remote, so anywhere in ${state.name} works the same way — ${metroList}, the suburbs around them and small towns in between. Your service-area pages list the places you actually travel to.`,
      },
      {
        q: "What does it cost?",
        a: `${SETUP} one time to build and launch the system, then your first 30 days of the ${MONTHLY}/month platform fee are free. The ${MONTHLY}/month starts in month two and covers hosting, updates, automation, reporting and support. Cancel anytime.`,
      },
      {
        q: "How long until it is live?",
        a: `You get 3 days of full access before paying anything, and the build starts as soon as you complete onboarding — you answer questions about your services, service area and pricing, and the system generates your site from your real business information.`,
      },
      {
        q: "Can I use my own domain?",
        a: "Yes. You can connect a domain you already own, or buy one from any registrar and point it at your Revora site. We show the exact DNS records and verify HTTPS for you.",
      },
      {
        q: `Will this help me rank in ${state.name} search results?`,
        a: `It gives you the foundation ranking requires: fast mobile pages, real service and location content, correct structured data, internal linking and a sitemap search engines can crawl. Combined with the review engine, that is what local ranking is actually built on. No one can promise a specific position.`,
      },
    ],
  };
}
