/**
 * REVORA MASTER BUILDER INTERPRETER
 * =================================
 *
 * Purpose:
 * Convert natural human instructions into a structured BuilderIntent that
 * the deterministic/free-first builder can safely execute.
 *
 * Design principles:
 * - Understand normal human language.
 * - Preserve multi-step instructions.
 * - Separate clauses so "remove X and add Y" stays deterministic.
 * - Detect pages, sections, design direction, conversion goals, SEO goals,
 *   mobile requirements, audience, location and safety constraints.
 * - Never invent business facts.
 * - Remain dependency-light and deterministic.
 * - Preserve the public interpret() contract used by the existing builder.
 */

import { playbookFor, type IndustryPlaybook } from "./industry";
import { normalise } from "./normalize";

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

export type BuilderVerb =
  | "build"
  | "add"
  | "remove"
  | "hide"
  | "show"
  | "rewrite"
  | "restyle"
  | "resize"
  | "reorder"
  | "seo"
  | "cta"
  | "mobile"
  | "hierarchy"
  | "fix";

export type StyleMood =
  | "professional"
  | "premium"
  | "minimal"
  | "bold"
  | "friendly"
  | "modern"
  | "dark"
  | "bright";

export type BuilderGoal =
  | "launch"
  | "redesign"
  | "conversion"
  | "leads"
  | "booking"
  | "calls"
  | "seo"
  | "local_seo"
  | "trust"
  | "speed"
  | "mobile"
  | "visual";

export type BuilderConstraint =
  | "keep_facts"
  | "no_invention"
  | "mobile_first"
  | "fast"
  | "accessible"
  | "simple"
  | "free_engine";

export type BuilderOperation = {
  raw: string;
  verbs: BuilderVerb[];
  sectionKinds: string[];
  moods: StyleMood[];
  goals: BuilderGoal[];
  constraints: BuilderConstraint[];
};

export type BuilderIntent = {
  original: string;
  verbs: BuilderVerb[];
  sectionKinds: string[];
  operations: BuilderOperation[];
  pageHints: string[];
  newPages: string[];
  moods: StyleMood[];
  goals: BuilderGoal[];
  constraints: BuilderConstraint[];
  industry: IndustryPlaybook | null;
  wholeSite: boolean;
  everyPage: boolean;
  keepFacts: boolean;
  carried: string | null;
  locationHint: string | null;
  audienceHint: string | null;
  visualIntensity: 0 | 1 | 2 | 3;
  unrecognised: string[];
};

/* -------------------------------------------------------------------------- */
/* SECTION VOCABULARY                                                         */
/* -------------------------------------------------------------------------- */

const SECTION_WORDS: Record<string, string[]> = {
  hero: [
    "hero",
    "banner",
    "header",
    "headline area",
    "main heading",
    "main title",
    "first screen",
  ],

  trust_bar: [
    "trust bar",
    "trust strip",
    "badges",
    "credentials",
    "logos",
    "certifications",
    "licensed and insured",
  ],

  intro: [
    "intro",
    "introduction",
    "about us",
    "who we are",
    "welcome",
    "our story",
    "team",
  ],

  services: [
    "services",
    "service list",
    "what we do",
    "offerings",
    "treatments",
    "menu",
  ],

  pricing: [
    "pricing",
    "prices",
    "price list",
    "packages",
    "rates",
    "cost",
    "financing",
    "payment plans",
  ],

  quote: [
    "quote form",
    "quote request",
    "estimate form",
    "request a quote",
    "estimate",
  ],

  booking: [
    "booking",
    "book online",
    "appointment",
    "calendar",
    "scheduler",
  ],

  reviews: [
    "reviews",
    "testimonials",
    "ratings",
    "feedback",
    "what customers say",
    "social proof",
    "five star",
    "5 star",
  ],

  gallery: [
    "gallery",
    "photos",
    "portfolio",
    "our work",
    "before and after",
    "images",
    "projects",
  ],

  faq: [
    "faq",
    "faqs",
    "questions",
    "common questions",
    "q and a",
  ],

  guarantee: [
    "guarantee",
    "warranty",
    "promise",
  ],

  offer: [
    "offer",
    "promotion",
    "deal",
    "discount",
    "special",
  ],

  cta: [
    "cta",
    "call to action",
    "closing section",
    "final push",
  ],

  sticky_cta: [
    "sticky",
    "floating button",
    "sticky bar",
    "always visible button",
    "floating cta",
  ],

  area: [
    "areas",
    "area served",
    "service area",
    "locations",
    "coverage",
    "where we work",
    "neighborhoods",
    "towns we serve",
  ],

  contact: [
    "contact",
    "contact details",
    "get in touch",
    "phone number section",
    "address",
  ],

  process: [
    "process",
    "how it works",
    "steps",
    "what happens next",
  ],

  benefits: [
    "benefits",
    "why choose us",
    "why us",
    "reasons",
  ],

  lead_magnet: [
    "lead magnet",
    "free guide",
    "download",
    "checklist",
  ],
};

/* -------------------------------------------------------------------------- */
/* DESIGN VOCABULARY                                                          */
/* -------------------------------------------------------------------------- */

const MOOD_WORDS: Record<StyleMood, string[]> = {
  professional: [
    "professional",
    "credible",
    "trustworthy",
    "serious",
    "corporate",
    "legit",
    "polished",
    "established",
  ],

  premium: [
    "premium",
    "high end",
    "high-end",
    "luxury",
    "luxurious",
    "upmarket",
    "elegant",
    "sophisticated",
    "classy",
    "upscale",
    "refined",
  ],

  minimal: [
    "minimal",
    "clean",
    "simple",
    "uncluttered",
    "less busy",
    "tidy",
    "understated",
  ],

  bold: [
    "bold",
    "punchy",
    "loud",
    "striking",
    "aggressive",
    "stand out",
    "wow",
    "eye catching",
    "attention grabbing",
  ],

  friendly: [
    "friendly",
    "warm",
    "welcoming",
    "approachable",
    "human",
    "playful",
    "fun",
    "down to earth",
  ],

  modern: [
    "modern",
    "fresh",
    "up to date",
    "current",
    "sleek",
    "contemporary",
    "cutting edge",
    "futuristic",
  ],

  dark: [
    "dark",
    "dark mode",
    "black",
    "night",
    "black background",
  ],

  bright: [
    "bright",
    "light",
    "airy",
    "white",
    "colourful",
    "colorful",
    "vibrant",
  ],
};

/* -------------------------------------------------------------------------- */
/* VERB VOCABULARY                                                            */
/* -------------------------------------------------------------------------- */

const VERB_WORDS: Record<BuilderVerb, string[]> = {
  build: [
    "build me",
    "build a",
    "build my",
    "build the",
    "create a website",
    "create my website",
    "create the website",
    "make me a website",
    "make me a site",
    "make my website",
    "new website",
    "whole website",
    "full website",
    "from scratch",
    "start over",
  ],

  add: [
    "add",
    "put in",
    "include",
    "insert",
    "create",
    "i need a",
    "i want a",
    "give me a",
  ],

  remove: [
    "remove",
    "delete",
    "get rid of",
    "take off",
    "take out",
    "drop",
  ],

  hide: [
    "hide",
    "turn off",
    "don't show",
    "dont show",
    "disable",
  ],

  show: [
    "show",
    "turn on",
    "unhide",
    "enable",
    "bring back",
  ],

  rewrite: [
    "rewrite",
    "reword",
    "better words",
    "improve the copy",
    "improve the text",
    "change the text",
    "change the wording",
    "make the copy better",
    "make it clearer",
    "more persuasive",
  ],

  restyle: [
    "restyle",
    "redesign",
    "design",
    "look",
    "style",
    "colours",
    "colors",
    "theme",
    "font",
    "brand",
    "feel",
    "vibe",
  ],

  resize: [
    "bigger",
    "larger",
    "smaller",
    "taller",
    "shorter",
    "full screen",
    "fullscreen",
  ],

  reorder: [
    "reorder",
    "move up",
    "move down",
    "put first",
    "put last",
    "rearrange",
    "move this above",
    "move this below",
  ],

  seo: [
    "seo",
    "google",
    "search",
    "rank",
    "ranking",
    "keyword",
    "keywords",
    "meta",
    "page title",
    "found online",
    "organic traffic",
  ],

  cta: [
    "call button",
    "book button",
    "booking button",
    "quote button",
    "call to action",
    "cta",
    "get more calls",
    "more leads",
    "more enquiries",
    "more inquiries",
    "convert",
    "conversion",
  ],

  mobile: [
    "mobile",
    "phone",
    "responsive",
    "tablet",
    "small screen",
    "on my phone",
  ],

  hierarchy: [
    "hierarchy",
    "order of importance",
    "prioritise",
    "prioritize",
    "most important first",
    "visual hierarchy",
    "better flow",
  ],

  fix: [
    "fix",
    "broken",
    "not working",
    "wrong",
    "error",
    "bug",
    "doesn't work",
    "doesnt work",
  ],
};

/* -------------------------------------------------------------------------- */
/* GOAL VOCABULARY                                                            */
/* -------------------------------------------------------------------------- */

const GOAL_WORDS: Record<BuilderGoal, string[]> = {
  launch: [
    "launch",
    "publish",
    "go live",
    "ready to launch",
    "live",
  ],

  redesign: [
    "redesign",
    "refresh",
    "revamp",
    "modernize",
    "modernise",
    "make over",
    "overhaul",
  ],

  conversion: [
    "convert",
    "conversion",
    "sell",
    "sales",
    "turn visitors",
    "more customers",
  ],

  leads: [
    "lead",
    "leads",
    "enquiry",
    "enquiries",
    "inquiry",
    "inquiries",
    "contact requests",
  ],

  booking: [
    "book",
    "booking",
    "appointments",
    "schedule",
    "scheduler",
  ],

  calls: [
    "call",
    "calls",
    "phone leads",
    "phone calls",
  ],

  seo: [
    "seo",
    "google",
    "search",
    "ranking",
    "traffic",
  ],

  local_seo: [
    "local seo",
    "near me",
    "service area",
    "city",
    "town",
    "local customers",
  ],

  trust: [
    "trust",
    "credibility",
    "proof",
    "reviews",
    "testimonials",
    "reassurance",
  ],

  speed: [
    "fast",
    "faster",
    "performance",
    "speed",
    "lightweight",
    "quick loading",
  ],

  mobile: [
    "mobile",
    "phone",
    "responsive",
  ],

  visual: [
    "3d",
    "three dimensional",
    "animation",
    "animated",
    "motion",
    "floating",
    "parallax",
    "glass",
    "glow",
    "premium",
    "wow",
  ],
};

/* -------------------------------------------------------------------------- */
/* CONSTRAINT VOCABULARY                                                      */
/* -------------------------------------------------------------------------- */

const CONSTRAINT_WORDS: Record<BuilderConstraint, string[]> = {
  keep_facts: [
    "keep my facts",
    "keep my information",
    "keep my business details",
    "don't change my details",
    "dont change my details",
    "use my real details",
  ],

  no_invention: [
    "don't invent",
    "dont invent",
    "no fake",
    "no fake reviews",
    "real only",
    "only real",
    "don't make up",
    "dont make up",
  ],

  mobile_first: [
    "mobile first",
    "phone first",
  ],

  fast: [
    "fast",
    "quick loading",
    "lightweight",
    "performance",
  ],

  accessible: [
    "accessible",
    "accessibility",
    "easy to read",
    "readable",
  ],

  simple: [
    "simple",
    "easy to use",
    "easy to edit",
    "not complicated",
  ],

  free_engine: [
    "free builder",
    "free engine",
    "no paid ai",
    "no credits",
    "without credits",
  ],
};

/* -------------------------------------------------------------------------- */
/* PAGE VOCABULARY                                                            */
/* -------------------------------------------------------------------------- */

const PAGE_WORDS = [
  "home",
  "homepage",
  "services",
  "about",
  "contact",
  "pricing",
  "gallery",
  "blog",
  "faq",
  "menu",
  "reviews",
  "booking",
  "book",
  "quote",
];

/**
 * Several page names are also ordinary English words, and reading one as a page
 * name derails the whole request: "make the headline clearer about what we do"
 * is not a request about the About page, and "book more jobs" is not about the
 * booking page. Those words only count as a page when the owner writes them
 * like a page — "the about page", "/about", "about us", "booking section".
 * Everything else ("home", "services", "pricing", "faq", "gallery", "blog")
 * only ever means a page here, so a plain mention is enough.
 */
const AMBIGUOUS_PAGE_WORDS = new Set([
  "about",
  "book",
  "booking",
  "quote",
  "contact",
  "home",
  "menu",
  "reviews",
]);

/** True when the text names this page the way an owner names a page. */
function pageWordMentioned(word: string, text: string): boolean {
  if (!AMBIGUOUS_PAGE_WORDS.has(word)) {
    return new RegExp(`\\b${word}\\b`, "i").test(text);
  }
  const patterns = [
    // "the about page", "booking section", "menu tab"
    new RegExp(`\\b${word}\\s+(?:page|pages|section|sections|screen|tab)\\b`, "i"),
    // "/about", "page: /booking"
    new RegExp(`/${word}\\b`, "i"),
    // "on about", "go to contact" — a destination, not a description
    new RegExp(`\\b(?:on|to|at)\\s+(?:the\\s+|my\\s+|our\\s+)?${word}\\b(?!\\s+(?:what|how|why|us\\b))`, "i"),
  ];
  if (word === "about" || word === "contact") {
    // "about us" / "contact us" is how owners name these two pages.
    patterns.push(new RegExp(`\\b${word}\\s+us\\b`, "i"));
  }
  if (word === "home") {
    patterns.push(/\bhome\s*page\b/i, /\bhomepage\b/i);
  }
  return patterns.some((pattern) => pattern.test(text));
}


/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

const clean = (value: string): string =>
  value.replace(/\s+/g, " ").trim();

const lower = (value: string): string =>
  clean(value).toLowerCase();

function matchWords<T extends string>(
  text: string,
  map: Record<T, string[]>,
): T[] {
  const hits: T[] = [];

  for (const [key, words] of Object.entries(map) as [T, string[]][]) {
    if (words.some((word) => text.includes(word))) {
      hits.push(key);
    }
  }

  return hits;
}

/* -------------------------------------------------------------------------- */
/* CLAUSE PARSER                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Splits compound instructions while protecting phrases that naturally
 * contain "and", such as "before and after".
 *
 * Example:
 *
 * "remove the gallery and add pricing and make the hero premium"
 *
 * becomes approximately:
 *
 * [
 *   "remove the gallery",
 *   "add pricing",
 *   "make the hero premium"
 * ]
 */
function splitClauses(text: string): string[] {
  const protectedText = text
    .replace(/\bbefore and after\b/gi, "before⁃and⁃after")
    .replace(/\bterms and conditions\b/gi, "terms⁃and⁃conditions")
    .replace(/\brock and roll\b/gi, "rock⁃and⁃roll");

  return protectedText
    .split(
      /\s+and then\s+|\s+and also\s+|\s*,\s*and\s+|\s*,\s*then\s+|\s*,\s*also\s+|;\s*|\s+then\s+|\s+also\s+|\s+and\s+/i,
    )
    .map((part) =>
      part
        .replace(/⁃/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/* PAGE EXTRACTION                                                            */
/* -------------------------------------------------------------------------- */

function readNewPages(text: string): string[] {
  const out: string[] = [];

  const patterns = [
    /(?:add|create|make|build|need|want)\s+(?:me\s+)?(?:a|an|another)?\s*([a-z0-9 &'-]{2,60}?)\s+page/gi,
    /\bpage\s+(?:for|about|on)\s+([a-z0-9 &'-]{2,60})/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const label = clean(match[1] ?? "")
        .replace(
          /\b(new|another|the|my|a|an)\b/gi,
          "",
        )
        .trim();

      if (
        label.length > 1 &&
        !isWholeSiteLabel(label) &&
        !out.some(
          (existing) =>
            lower(existing) === lower(label),
        )
      ) {
        out.push(label);
      }
    }
  }

  return out.slice(0, 8);
}

/**
 * A label that describes building an entire website ("website with a home
 * page", "company website for ...") is not the name of a single page. Treating
 * it as a page title produces a duplicated whole-site request.
 */
function isWholeSiteLabel(
  label: string,
): boolean {
  const normalized =
    lower(label);

  if (
    normalized.match(
      /\bwebsite\b|\bweb ?site\b|\bsite\b|\bcompany website\b/,
    )
  ) {
    return true;
  }

  if (
    /\b(company|business|firm|practice)\s+website\b/.test(
      normalized,
    )
  ) {
    return true;
  }

  return false;
}

/* -------------------------------------------------------------------------- */
/* LOCATION EXTRACTION                                                        */
/* -------------------------------------------------------------------------- */

const LOCATION_STOPWORDS = new Set([
  "I",
  "SEO",
  "CTA",
  "FAQ",
  "Home",
  "Homepage",
  "Google",
  "Booking",
  "Hero",
]);

function readLocationHint(original: string): string | null {
  const pattern =
    /\b(?:in|for|near|around|serving|target)\s+([A-Z][a-zA-Z'-]*(?:\s+[A-Z][a-zA-Z'-]*){0,2}(?:,\s*[A-Z]{2})?)\b/g;

  for (const match of original.matchAll(pattern)) {
    const candidate = clean(match[1] ?? "");

    const first =
      candidate.split(/[\s,]/)[0] ?? "";

    if (
      candidate &&
      !LOCATION_STOPWORDS.has(first)
    ) {
      return candidate;
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* AUDIENCE EXTRACTION                                                        */
/* -------------------------------------------------------------------------- */

function readAudienceHint(
  original: string,
): string | null {
  const patterns = [
    /\bfor\s+(homeowners|business owners|families|parents|professionals|contractors|property managers|first[- ]time buyers|local businesses|small businesses)\b/i,

    /\btarget(?:ing)?\s+([a-z][a-z -]{2,50})/i,

    /\bideal customers?\s*(?:are|:)\s*([a-z][a-z -]{2,50})/i,
  ];

  for (const pattern of patterns) {
    const match = original.match(pattern);

    if (match?.[1]) {
      return clean(match[1]);
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* VISUAL INTENSITY                                                           */
/* -------------------------------------------------------------------------- */

function visualIntensity(
  text: string,
  moods: StyleMood[],
  goals: BuilderGoal[],
): 0 | 1 | 2 | 3 {
  let score = 0;

  if (
    moods.includes("premium") ||
    moods.includes("bold") ||
    moods.includes("modern")
  ) {
    score += 1;
  }

  if (goals.includes("visual")) {
    score += 1;
  }

  if (
    /\b(3d|three dimensional|floating|parallax|glass|glow|animated|animation|motion|depth|cinematic|immersive)\b/i.test(
      text,
    )
  ) {
    score += 2;
  }

  if (
    /\b(subtle|light motion|tasteful|restrained)\b/i.test(text)
  ) {
    score = Math.max(0, score - 1);
  }

  return Math.min(
    3,
    score,
  ) as 0 | 1 | 2 | 3;
}

/* -------------------------------------------------------------------------- */
/* PUBLIC INTERPRETER                                                         */
/* -------------------------------------------------------------------------- */

export function interpret(
  instruction: string,
  history: string[] = [],
): BuilderIntent {
  const normalised = normalise(
    instruction,
    history,
  );

  const original = normalised.original;
  const text = normalised.text;

  const verbs = matchWords(
    text,
    VERB_WORDS,
  );

  const sectionKinds = matchWords(
    text,
    SECTION_WORDS,
  );

  const moods = matchWords(
    text,
    MOOD_WORDS,
  );

  const goals = matchWords(
    text,
    GOAL_WORDS,
  );

  const constraints = matchWords(
    text,
    CONSTRAINT_WORDS,
  );

  /* ---------------------------------------------------------------------- */
  /* OPERATION-LEVEL UNDERSTANDING                                          */
  /* ---------------------------------------------------------------------- */

  const operations: BuilderOperation[] =
    splitClauses(text)
      .map((clause) => ({
        raw: clause,

        verbs: matchWords(
          clause,
          VERB_WORDS,
        ),

        sectionKinds: matchWords(
          clause,
          SECTION_WORDS,
        ),

        moods: matchWords(
          clause,
          MOOD_WORDS,
        ),

        goals: matchWords(
          clause,
          GOAL_WORDS,
        ),

        constraints: matchWords(
          clause,
          CONSTRAINT_WORDS,
        ),
      }))
      .filter(
        (operation) =>
          operation.verbs.length > 0 ||
          operation.sectionKinds.length > 0 ||
          operation.moods.length > 0 ||
          operation.goals.length > 0 ||
          operation.constraints.length > 0,
      );

  /* ---------------------------------------------------------------------- */
  /* PAGE UNDERSTANDING                                                      */
  /* ---------------------------------------------------------------------- */

  const pageHints = PAGE_WORDS.filter(
    (page) =>
      new RegExp(
        `\\b${page}\\b`,
        "i",
      ).test(text),
  );

  const newPages = readNewPages(text);

  /* ---------------------------------------------------------------------- */
  /* INDUSTRY UNDERSTANDING                                                  */
  /* ---------------------------------------------------------------------- */

  const matchedIndustry =
    playbookFor(original);

  const industry =
    matchedIndustry.slug ===
    "local_business"
      ? null
      : matchedIndustry;

  /* ---------------------------------------------------------------------- */
  /* CONTEXT                                                                 */
  /* ---------------------------------------------------------------------- */

  const locationHint =
    readLocationHint(original);

  const audienceHint =
    readAudienceHint(original);

  /* ---------------------------------------------------------------------- */
  /* SITE-WIDE INTENT                                                        */
  /* ---------------------------------------------------------------------- */

  /**
   * "Build" by itself is NOT enough to force every existing page to be
   * rewritten.
   *
   * The builder should interpret:
   *
   * "build a pricing page"
   *
   * as a targeted page request rather than destroying/rebuilding the site.
   */
  const explicitWholeSitePhrase =
    /\b(whole|entire|full|everything|all of it|the whole site|the entire site|my whole site|my entire site|across the site|sitewide|site wide|from scratch)\b/i.test(
      text,
    );

  const explicitWebsiteCreation =
    /\b(build me a website|build my website|create my website|create a website from scratch|make me a website|make my website from scratch|start over|new website|build me a site|create a site|make me a site)\b/i.test(
      text,
    );

  /**
   * A bare website build ("build me a plumbing website") is a whole-site
   * request: the user wants the essential pages built, not a single named
   * page. Targeted page requests ("add a pricing page") stay single-page.
   *
   * The frame must pair an explicit build/create verb with the word
   * "website"/"site" and must not be aimed at a named page.
   */
  const websiteBuildFrame =
    /\b(build me|build a|build my|build us|build the site|build a brand|create a|create my|create an|make me a|make me an|set up a|set up my|start my)\b[^.!?\n]{0,120}\b(website|web ?site|site)\b/i.test(
      text,
    );

  const wholeSite =
    explicitWholeSitePhrase ||
    explicitWebsiteCreation ||
    websiteBuildFrame ||
    goals.includes("redesign");

  const everyPage =
    /\b(on every page|every page|all pages|across every page|across all pages|sitewide|site wide|throughout the site|across the entire site)\b/i.test(
      text,
    );

  /* ---------------------------------------------------------------------- */
  /* FACT SAFETY                                                             */
  /* ---------------------------------------------------------------------- */

  const keepFacts =
    constraints.includes(
      "keep_facts",
    ) ||
    constraints.includes(
      "no_invention",
    );

  /* ---------------------------------------------------------------------- */
  /* UNRECOGNISED INTENT                                                    */
  /* ---------------------------------------------------------------------- */

  const unrecognised: string[] = [];

  const hasMeaningfulIntent =
    verbs.length > 0 ||
    sectionKinds.length > 0 ||
    moods.length > 0 ||
    goals.length > 0 ||
    newPages.length > 0 ||
    Boolean(locationHint) ||
    Boolean(audienceHint);

  if (!hasMeaningfulIntent) {
    unrecognised.push(
      original,
    );
  }

  /* ---------------------------------------------------------------------- */
  /* RESULT                                                                  */
  /* ---------------------------------------------------------------------- */

  return {
    original,

    verbs,

    sectionKinds,

    operations,

    pageHints,

    newPages,

    moods,

    goals,

    constraints,

    industry,

    wholeSite,

    everyPage,

    keepFacts,

    carried:
      normalised.carried,

    locationHint,

    audienceHint,

    visualIntensity:
      visualIntensity(
        text,
        moods,
        goals,
      ),

    unrecognised,
  };
}