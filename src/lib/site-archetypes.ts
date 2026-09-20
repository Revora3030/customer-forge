/**
 * Revora site archetypes.
 *
 * A local plumber, a restaurant, a dental clinic, a gym, a law firm and an
 * online shop should not receive the same website with different words. This
 * module defines the *shape* of a website — which pages exist, which sections
 * each page carries and which action the site is pointed at — for a wide range
 * of business types, and classifies a business into the archetype that fits.
 *
 * Rules this module never breaks:
 * - It only describes structure and headings. It never states a fact about the
 *   business (no prices, claims, credentials, reviews, hours or results).
 * - It only uses section and page kinds the renderer already supports, so every
 *   archetype flows through the existing AgentAction / materialize pipeline.
 */

import type { PageKind, SectionKind } from "@/lib/website-content";

export type ArchetypeGoal = "quote" | "book" | "call" | "visit" | "purchase" | "lead" | "consult";

export type ArchetypeSection = {
  kind: SectionKind;
  /** Structural heading. May use {name} and {place} tokens. */
  heading: string;
  subheading?: string;
};

export type ArchetypePage = {
  slug: string;
  title: string;
  kind: PageKind;
  sections: ArchetypeSection[];
};

export type SiteArchetype = {
  id: string;
  name: string;
  /** One plain line the owner understands. */
  summary: string;
  goal: ArchetypeGoal;
  /** Words that point a business at this archetype. */
  keywords: string[];
  /** Extra home-page sections, inserted before the closing call to action. */
  homeSections: ArchetypeSection[];
  /** Extra pages, added before the contact page. */
  pages: ArchetypePage[];
};

const S = (kind: SectionKind, heading: string, subheading?: string): ArchetypeSection =>
  subheading ? { kind, heading, subheading } : { kind, heading };

export const SITE_ARCHETYPES: SiteArchetype[] = [
  {
    id: "local_service",
    name: "Local service business",
    summary: "Trust, service menu and a fast way to request the job.",
    goal: "quote",
    keywords: [
      "plumb", "hvac", "heating", "electric", "roof", "clean", "landscap", "lawn", "pressure wash",
      "handyman", "pest", "septic", "drain", "mov", "junk", "gutter", "fenc", "paint", "window",
      "locksmith", "appliance", "tree", "snow", "pool",
    ],
    homeSections: [
      S("process", "How it works", "What happens after you get in touch."),
      S("areas", "Areas we cover"),
      S("guarantee", "Our promise to you"),
    ],
    pages: [
      {
        slug: "areas",
        title: "Areas we cover",
        kind: "area",
        sections: [S("areas", "Where we work"), S("cta", "Not sure if you're in range?")],
      },
    ],
  },
  {
    id: "emergency_service",
    name: "24/7 emergency service",
    summary: "Phone-first layout built for people in trouble right now.",
    goal: "call",
    keywords: ["emergency", "24/7", "tow", "restoration", "water damage", "flood", "mold", "board up", "lockout", "urgent"],
    homeSections: [
      S("trust_bar", "Fast response"),
      S("process", "What happens when you call"),
      S("areas", "Areas we respond to"),
    ],
    pages: [
      {
        slug: "emergency",
        title: "Emergency help",
        kind: "custom",
        sections: [S("hero", "Need help now?"), S("contact", "Reach us straight away")],
      },
    ],
  },
  {
    id: "restaurant",
    name: "Restaurant or cafe",
    summary: "Menu, atmosphere photos and a table booking or ordering path.",
    goal: "visit",
    keywords: ["restaur", "cafe", "coffee", "bakery", "bar", "pub", "grill", "pizza", "deli", "food truck", "bistro", "diner", "brunch", "sushi", "taco", "brew"],
    homeSections: [
      S("gallery", "Inside {name}"),
      S("offer", "What's on"),
      S("contact", "Find us"),
    ],
    pages: [
      {
        slug: "menu",
        title: "Menu",
        kind: "custom",
        sections: [S("services", "Our menu"), S("cta", "Hungry?")],
      },
      {
        slug: "visit",
        title: "Visit",
        kind: "custom",
        sections: [S("contact", "Where to find us"), S("faq", "Before you come")],
      },
    ],
  },
  {
    id: "catering",
    name: "Catering and events food",
    summary: "Packages, gallery and an enquiry form with event details.",
    goal: "quote",
    keywords: ["cater", "private chef", "event food", "buffet", "meal prep", "food service"],
    homeSections: [S("gallery", "Recent events"), S("process", "How booking works"), S("faq", "Catering questions")],
    pages: [
      {
        slug: "packages",
        title: "Packages",
        kind: "services",
        sections: [S("pricing", "Packages"), S("quote", "Tell us about your event")],
      },
    ],
  },
  {
    id: "retail_shop",
    name: "Shop or online store",
    summary: "Product-led pages with a clear buying path.",
    goal: "purchase",
    keywords: ["shop", "store", "boutique", "retail", "ecommerce", "e-commerce", "merch", "gift", "apparel", "clothing", "jewel", "furniture", "candle", "print shop"],
    homeSections: [
      S("services", "Shop by category"),
      S("gallery", "New in"),
      S("reviews", "What customers say"),
    ],
    pages: [
      {
        slug: "shop",
        title: "Shop",
        kind: "services",
        sections: [S("services", "Everything we sell"), S("cta", "Ready to order?")],
      },
      {
        slug: "shipping",
        title: "Shipping and returns",
        kind: "custom",
        sections: [S("faq", "Shipping and returns")],
      },
    ],
  },
  {
    id: "clinic",
    name: "Medical or dental clinic",
    summary: "Treatments, practitioners and an appointment request.",
    goal: "book",
    keywords: ["dental", "dentist", "clinic", "medical", "doctor", "chiro", "physio", "podiat", "optom", "derma", "ortho", "health centre", "health center", "paediatric", "pediatric", "urgent care"],
    homeSections: [
      S("services", "Treatments"),
      S("process", "Your first visit"),
      S("faq", "Patient questions"),
    ],
    pages: [
      {
        slug: "treatments",
        title: "Treatments",
        kind: "services",
        sections: [S("services", "Treatments we provide"), S("booking", "Request an appointment")],
      },
      {
        slug: "team",
        title: "Our team",
        kind: "about",
        sections: [S("intro", "Meet the team"), S("cta", "Ready to book?")],
      },
    ],
  },
  {
    id: "therapy",
    name: "Therapy and mental health",
    summary: "Calm, private layout leading to a first consultation.",
    goal: "consult",
    keywords: ["therap", "counsel", "psycholog", "psychiat", "mental health", "wellbeing", "addiction", "recovery"],
    homeSections: [S("process", "How sessions work"), S("faq", "Common questions"), S("guarantee", "Privacy and confidentiality")],
    pages: [
      {
        slug: "sessions",
        title: "Sessions",
        kind: "services",
        sections: [S("services", "Ways we work together"), S("booking", "Request a first session")],
      },
    ],
  },
  {
    id: "salon_spa",
    name: "Salon, spa or beauty studio",
    summary: "Treatment menu, portfolio and one-tap booking.",
    goal: "book",
    keywords: ["salon", "spa", "beauty", "hair", "barber", "nail", "lash", "brow", "wax", "massage", "aesthetic", "skin", "makeup", "tan", "tattoo", "piercing"],
    homeSections: [
      S("gallery", "Our work"),
      S("pricing", "Treatment menu"),
      S("reviews", "Client words"),
    ],
    pages: [
      {
        slug: "menu",
        title: "Treatments",
        kind: "services",
        sections: [S("pricing", "Treatment menu"), S("booking", "Book a treatment")],
      },
    ],
  },
  {
    id: "fitness",
    name: "Gym, studio or coaching",
    summary: "Classes, memberships and a trial signup.",
    goal: "book",
    keywords: ["gym", "fitness", "crossfit", "pilates", "yoga", "boxing", "martial", "personal train", "bootcamp", "dance", "swim", "cycle studio"],
    homeSections: [
      S("services", "Classes and programmes"),
      S("pricing", "Memberships"),
      S("reviews", "Member results"),
    ],
    pages: [
      {
        slug: "timetable",
        title: "Timetable",
        kind: "custom",
        sections: [S("services", "Class timetable"), S("booking", "Book a session")],
      },
      {
        slug: "memberships",
        title: "Memberships",
        kind: "pricing",
        sections: [S("pricing", "Membership options"), S("faq", "Membership questions")],
      },
    ],
  },
  {
    id: "real_estate",
    name: "Real estate and lettings",
    summary: "Listings, areas and a valuation or viewing request.",
    goal: "lead",
    keywords: ["real estate", "realtor", "estate agent", "letting", "property", "mortgage broker", "landlord", "rental management"],
    homeSections: [
      S("gallery", "Featured properties"),
      S("areas", "Areas we cover"),
      S("process", "How we work"),
    ],
    pages: [
      {
        slug: "properties",
        title: "Properties",
        kind: "custom",
        sections: [S("gallery", "Available now"), S("quote", "Request a viewing")],
      },
      {
        slug: "valuation",
        title: "Valuation",
        kind: "custom",
        sections: [S("quote", "Request a valuation")],
      },
    ],
  },
  {
    id: "legal_finance",
    name: "Legal, accounting or finance",
    summary: "Practice areas, credibility and a consultation request.",
    goal: "consult",
    keywords: ["law", "legal", "solicitor", "attorney", "advoc", "account", "bookkeep", "tax", "audit", "financial advis", "wealth", "insur", "notary", "paralegal"],
    homeSections: [
      S("services", "How we help"),
      S("process", "Working with us"),
      S("faq", "Questions we get asked"),
    ],
    pages: [
      {
        slug: "expertise",
        title: "Expertise",
        kind: "services",
        sections: [S("services", "Areas we work in"), S("cta", "Talk to us")],
      },
      {
        slug: "consultation",
        title: "Consultation",
        kind: "custom",
        sections: [S("quote", "Request a consultation")],
      },
    ],
  },
  {
    id: "agency",
    name: "Agency or studio",
    summary: "Case-study led pages with a project enquiry.",
    goal: "lead",
    keywords: ["agency", "marketing", "advertis", "seo", "branding", "design studio", "creative", "web design", "pr ", "media buy", "content studio"],
    homeSections: [
      S("gallery", "Selected work"),
      S("process", "How we work"),
      S("stats", "By the numbers"),
    ],
    pages: [
      {
        slug: "work",
        title: "Work",
        kind: "gallery",
        sections: [S("gallery", "Our work"), S("cta", "Have a project in mind?")],
      },
      {
        slug: "services",
        title: "What we do",
        kind: "services",
        sections: [S("services", "What we do"), S("quote", "Start a project")],
      },
    ],
  },
  {
    id: "saas_product",
    name: "Software or app",
    summary: "Product value, how it works and a signup path.",
    goal: "lead",
    keywords: ["software", "saas", "app", "platform", "api", "startup", "dashboard", "automation tool", "crm software"],
    homeSections: [
      S("benefits", "What you get"),
      S("process", "How it works"),
      S("pricing", "Plans"),
      S("faq", "Product questions"),
    ],
    pages: [
      {
        slug: "features",
        title: "Features",
        kind: "services",
        sections: [S("benefits", "Features"), S("cta", "Ready to try it?")],
      },
      {
        slug: "pricing",
        title: "Pricing",
        kind: "pricing",
        sections: [S("pricing", "Plans"), S("faq", "Billing questions")],
      },
    ],
  },
  {
    id: "portfolio",
    name: "Portfolio or personal brand",
    summary: "Work first, story second, one clear way to get in touch.",
    goal: "lead",
    keywords: ["photograph", "videograph", "portfolio", "artist", "illustrat", "musician", "writer", "author", "speaker", "model", "architect", "interior design", "freelance"],
    homeSections: [S("gallery", "Work"), S("intro", "About {name}"), S("reviews", "Kind words")],
    pages: [
      {
        slug: "portfolio",
        title: "Portfolio",
        kind: "gallery",
        sections: [S("gallery", "Portfolio"), S("cta", "Like what you see?")],
      },
    ],
  },
  {
    id: "education",
    name: "School, course or tutoring",
    summary: "Programmes, outcomes and an enrolment enquiry.",
    goal: "lead",
    keywords: ["school", "academy", "tutor", "course", "training", "education", "college", "driving instructor", "language", "music lesson", "workshop", "bootcamp", "nursery", "childcare", "preschool"],
    homeSections: [
      S("services", "Programmes"),
      S("process", "How enrolment works"),
      S("faq", "Parent and student questions"),
    ],
    pages: [
      {
        slug: "programmes",
        title: "Programmes",
        kind: "services",
        sections: [S("services", "Programmes"), S("quote", "Enquire about a place")],
      },
      {
        slug: "admissions",
        title: "Admissions",
        kind: "custom",
        sections: [S("process", "Admissions"), S("faq", "Admissions questions")],
      },
    ],
  },
  {
    id: "events_venue",
    name: "Venue or event business",
    summary: "Spaces, gallery and an availability enquiry.",
    goal: "book",
    keywords: ["venue", "event space", "wedding", "conference", "party", "hall", "banquet", "festival", "exhibition", "dj", "entertainment"],
    homeSections: [
      S("gallery", "The space"),
      S("services", "What's included"),
      S("faq", "Event questions"),
    ],
    pages: [
      {
        slug: "spaces",
        title: "Spaces",
        kind: "gallery",
        sections: [S("gallery", "Our spaces"), S("quote", "Check availability")],
      },
    ],
  },
  {
    id: "hospitality",
    name: "Hotel, B&B or rental",
    summary: "Rooms, location and a direct booking enquiry.",
    goal: "book",
    keywords: ["hotel", "motel", "b&b", "bed and breakfast", "guest house", "hostel", "airbnb", "holiday let", "lodge", "cabin", "campsite", "glamping", "resort"],
    homeSections: [
      S("gallery", "Rooms and spaces"),
      S("benefits", "What's included"),
      S("areas", "Getting here"),
    ],
    pages: [
      {
        slug: "rooms",
        title: "Rooms",
        kind: "custom",
        sections: [S("gallery", "Rooms"), S("booking", "Check dates")],
      },
      {
        slug: "location",
        title: "Location",
        kind: "area",
        sections: [S("areas", "Where we are"), S("faq", "Before you arrive")],
      },
    ],
  },
  {
    id: "travel",
    name: "Travel and tours",
    summary: "Trips, itineraries and a booking enquiry.",
    goal: "book",
    keywords: ["tour", "travel", "safari", "excursion", "charter", "cruise", "guide service", "adventure", "trek", "sightseeing"],
    homeSections: [S("services", "Trips"), S("gallery", "On tour"), S("faq", "Travel questions")],
    pages: [
      {
        slug: "tours",
        title: "Tours",
        kind: "services",
        sections: [S("services", "Tours"), S("booking", "Reserve a place")],
      },
    ],
  },
  {
    id: "automotive",
    name: "Automotive sales or repair",
    summary: "Stock or services, workshop proof and a booking path.",
    goal: "book",
    keywords: ["auto", "car", "garage", "mechanic", "mot", "tyre", "tire", "body shop", "dealership", "detail", "valet", "motorcycle", "truck repair", "ev charg"],
    homeSections: [
      S("services", "What we do"),
      S("gallery", "In the workshop"),
      S("pricing", "Common jobs"),
    ],
    pages: [
      {
        slug: "book",
        title: "Book in",
        kind: "book",
        sections: [S("booking", "Book your vehicle in"), S("faq", "Workshop questions")],
      },
    ],
  },
  {
    id: "trades_construction",
    name: "Construction and renovation",
    summary: "Project gallery, process and a detailed quote request.",
    goal: "quote",
    keywords: ["construct", "builder", "renovat", "remodel", "extension", "kitchen", "bathroom", "carpent", "joiner", "tile", "plaster", "concrete", "scaffold", "groundwork", "solar", "insulat"],
    homeSections: [
      S("gallery", "Recent projects"),
      S("process", "How a project runs"),
      S("guarantee", "Standards we work to"),
    ],
    pages: [
      {
        slug: "projects",
        title: "Projects",
        kind: "gallery",
        sections: [S("gallery", "Projects"), S("quote", "Tell us about your project")],
      },
    ],
  },
  {
    id: "pets",
    name: "Pet services",
    summary: "Services, friendly proof and easy booking.",
    goal: "book",
    keywords: ["pet", "dog", "cat", "groom", "vet", "kennel", "cattery", "walk", "train", "aquarium", "animal"],
    homeSections: [S("services", "Services"), S("gallery", "Our furry clients"), S("faq", "Owner questions")],
    pages: [
      {
        slug: "book",
        title: "Book",
        kind: "book",
        sections: [S("booking", "Book a visit")],
      },
    ],
  },
  {
    id: "nonprofit",
    name: "Nonprofit or community group",
    summary: "Mission, programmes and ways to support or get involved.",
    goal: "lead",
    keywords: ["charity", "nonprofit", "non-profit", "foundation", "community", "volunteer", "church", "temple", "mosque", "outreach", "shelter", "food bank", "support group", "club", "society"],
    homeSections: [
      S("intro", "Our mission"),
      S("services", "What we do"),
      S("stats", "Our impact"),
      S("lead_magnet", "Get involved"),
    ],
    pages: [
      {
        slug: "programmes",
        title: "What we do",
        kind: "services",
        sections: [S("services", "Programmes"), S("cta", "Want to help?")],
      },
      {
        slug: "get-involved",
        title: "Get involved",
        kind: "custom",
        sections: [S("lead_magnet", "Ways to help"), S("contact", "Talk to us")],
      },
    ],
  },
  {
    id: "b2b_industrial",
    name: "Industrial, trade supply or logistics",
    summary: "Capability-led pages with a commercial enquiry route.",
    goal: "quote",
    keywords: ["manufact", "industrial", "wholesale", "distribut", "logistic", "haulage", "freight", "warehous", "engineer", "fabricat", "machin", "supply", "agri", "farm", "plant hire", "recycl", "waste"],
    homeSections: [
      S("services", "Capabilities"),
      S("stats", "Capacity and coverage"),
      S("process", "How we onboard new clients"),
    ],
    pages: [
      {
        slug: "capabilities",
        title: "Capabilities",
        kind: "services",
        sections: [S("services", "Capabilities"), S("quote", "Request a commercial quote")],
      },
    ],
  },
  {
    id: "care_services",
    name: "Care and support services",
    summary: "Reassuring layout with care options and a family enquiry.",
    goal: "consult",
    keywords: ["care", "carer", "senior", "elderly", "nurs", "home care", "disability", "respite", "support work", "hospice"],
    homeSections: [
      S("services", "Types of care"),
      S("process", "How care starts"),
      S("guarantee", "Our standards"),
      S("faq", "Family questions"),
    ],
    pages: [
      {
        slug: "care",
        title: "Types of care",
        kind: "services",
        sections: [S("services", "Types of care"), S("quote", "Talk to our team")],
      },
    ],
  },
  {
    id: "events_photography",
    name: "Weddings and occasions",
    summary: "Emotional gallery, packages and a date-availability enquiry.",
    goal: "quote",
    keywords: ["wedding", "bridal", "florist", "cake", "celebrant", "planner", "photo booth", "limousine", "funeral", "memorial"],
    homeSections: [S("gallery", "Recent days"), S("pricing", "Packages"), S("reviews", "Client words")],
    pages: [
      {
        slug: "packages",
        title: "Packages",
        kind: "pricing",
        sections: [S("pricing", "Packages"), S("quote", "Check your date")],
      },
    ],
  },
  {
    id: "consulting",
    name: "Consulting and coaching",
    summary: "Outcome-led copy, method and a discovery call.",
    goal: "consult",
    keywords: ["consult", "coach", "mentor", "advis", "strategy", "business coach", "career", "leadership", "recruit", "hr "],
    homeSections: [
      S("benefits", "What changes"),
      S("process", "How we work together"),
      S("faq", "Before you book"),
    ],
    pages: [
      {
        slug: "work-with-me",
        title: "Work with us",
        kind: "services",
        sections: [S("services", "Ways to work together"), S("booking", "Book a discovery call")],
      },
    ],
  },
];

const HAYSTACK_LIMIT = 2000;

/** Picks the archetype that best fits a business. Pure and deterministic. */
export function classifyArchetype(input: {
  industry?: string | null;
  businessName?: string | null;
  description?: string | null;
  services?: { name?: string | null }[];
}): SiteArchetype {
  const haystack = [
    input.industry ?? "",
    input.businessName ?? "",
    input.description ?? "",
    (input.services ?? []).map((service) => service?.name ?? "").join(" "),
  ]
    .join(" ")
    .toLowerCase()
    .slice(0, HAYSTACK_LIMIT);

  let best: { archetype: SiteArchetype; score: number } | null = null;
  for (const archetype of SITE_ARCHETYPES) {
    let score = 0;
    for (const keyword of archetype.keywords) {
      if (!haystack.includes(keyword)) continue;
      // Industry text is the strongest signal, then services, then free text.
      score += (input.industry ?? "").toLowerCase().includes(keyword) ? 6 : 2;
      score += keyword.length / 20;
    }
    if (score > 0 && (!best || score > best.score)) best = { archetype, score };
  }

  return best?.archetype ?? SITE_ARCHETYPES[0]!;
}

export const archetypeById = (id: string | null | undefined): SiteArchetype | null =>
  SITE_ARCHETYPES.find((archetype) => archetype.id === id) ?? null;

/** Fills the structural tokens an archetype heading may contain. */
export function resolveArchetypeText(
  text: string,
  context: { businessName: string; place?: string | null },
): string {
  return text
    .replace(/\{name\}/g, context.businessName || "us")
    .replace(/\{place\}/g, context.place ?? "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
