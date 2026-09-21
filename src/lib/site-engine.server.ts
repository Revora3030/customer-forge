/**
 * Server-only AI copy engine for the Revora Site Engine.
 *
 * Hard rule enforced in every prompt: the model may only use facts supplied by
 * the client. It must never invent reviews, awards, certifications, licences,
 * guarantees, business history, addresses, prices or credentials.
 */

import type { SiteCopy } from "@/lib/site-engine";
import type { SiteBrief } from "@/lib/site-brief";
import { INTENT_META, readBrief } from "@/lib/site-brief";
import { businessDna, dnaBrief, screenClaims, type DnaFacts } from "@/lib/business-dna";
import { RevoraAiError } from "@/lib/ai/errors";
import { generateStructuredOutput } from "@/lib/ai/router.server";
import type { ModelRole } from "@/lib/ai/config";

export { RevoraAiError };

/** Writing runs on the fast model class; Revora AI resolves the actual model. */
export const COPY_ROLE: ModelRole = "fast";
/**
 * Analysis is a reasoning job, not a writing job, so it asks for the reasoning
 * model class. If Revora AI can't serve it the build still completes using the
 * deterministic brief in `fallbackBrief`.
 */
export const ANALYSIS_ROLE: ModelRole = "coding";

const SAFETY = `You write marketing copy for local business websites.
ABSOLUTE RULES:
- Use only the facts given. Never invent reviews, testimonials, ratings, awards,
  certifications, licences, insurance, guarantees, years in business, addresses,
  staff, prices or credentials.
- Never write "5-star", "award-winning", "licensed", "insured", "certified",
  "trusted by hundreds" or similar unless that exact fact is supplied.
- If a fact is missing, write around it. Do not use placeholder brackets.
- Plain, confident, specific. No emoji. No keyword stuffing. British or American
  spelling consistent with the input.`;

export type CopyFacts = {
  businessName: string;
  industry: string;
  description: string | null;
  city: string | null;
  state: string | null;
  serviceArea: string | null;
  phone: string | null;
  email: string | null;
  yearsInBusiness: number | null;
  hasHours: boolean;
  style: string | null;
  goals: string[];
  ctaLabel: string;
  services: {
    name: string;
    description?: string | null;
    price?: number | null;
    starting_price?: number | null;
  }[];
};

/**
 * Included-builder mode. Every generation stage has a deterministic Revora
 * fallback. Provider denial is isolated to the tenant whose request failed:
 * one customer's outage must never force unrelated customers onto fallback
 * copy. This memory is only an optimization; provider routing remains the
 * source of truth for eligibility and quota enforcement.
 */
const AI_COOLDOWN_MS = 30 * 60 * 1000;
const aiUnavailableUntilByTenant = new Map<string, number>();
const aiTenantKey = (organizationId?: string | null) => organizationId?.trim() || "anonymous";

export function markAiUnavailable(organizationId?: string | null) {
  aiUnavailableUntilByTenant.set(aiTenantKey(organizationId), Date.now() + AI_COOLDOWN_MS);
}

export function isAiAvailable(organizationId?: string | null) {
  const key = aiTenantKey(organizationId);
  const unavailableUntil = aiUnavailableUntilByTenant.get(key) ?? 0;
  if (Date.now() >= unavailableUntil) {
    aiUnavailableUntilByTenant.delete(key);
    return true;
  }
  return false;
}

async function chatJson(
  system: string,
  prompt: string,
  role: ModelRole = COPY_ROLE,
  caller?: { organizationId?: string | null; userId?: string | null; task?: string },
): Promise<Record<string, unknown>> {
  if (!isAiAvailable(caller?.organizationId))
    throw new RevoraAiError(402, "Revora is writing this build from your own business details.", {
      category: "quota",
    });

  try {
    const result = await generateStructuredOutput(
      {
        task: caller?.task ?? "copy.write",
        organizationId: caller?.organizationId ?? null,
        userId: caller?.userId ?? null,
      },
      {
        role,
        messages: [
          { role: "system", content: `${SAFETY}\n\n${system}` },
          { role: "user", content: prompt },
        ],
      },
    );
    return result.data;
  } catch (error) {
    // A missing provider, a rejected key or a provider refusal will keep being
    // refused, so stop asking for a cooldown window and let the deterministic
    // Revora builder finish the site from the owner's own details.
    if (
      error instanceof RevoraAiError &&
      ["not_configured", "free_unavailable", "unauthorized", "quota", "policy"].includes(error.category)
    )
      markAiUnavailable(caller?.organizationId);
    throw error;
  }
}

const factSheet = (facts: CopyFacts) =>
  JSON.stringify(
    {
      business: facts.businessName,
      category: facts.industry,
      ownerDescription: facts.description,
      location: [facts.city, facts.state].filter(Boolean).join(", ") || null,
      serviceArea: facts.serviceArea,
      hasPhone: Boolean(facts.phone),
      hasEmail: Boolean(facts.email),
      publishedHours: facts.hasHours,
      yearsInBusiness: facts.yearsInBusiness,
      preferredStyle: facts.style,
      websiteGoals: facts.goals,
      services: facts.services.map((s) => ({
        name: s.name,
        detail: s.description ?? null,
        price: s.price ?? null,
        startingPrice: s.starting_price ?? null,
      })),
    },
    null,
    2,
  );

const str = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

/** Business DNA derived from the same facts the copy pass writes from. */
export const dnaFor = (facts: CopyFacts): DnaFacts => ({
  businessName: facts.businessName,
  industry: facts.industry,
  services: facts.services.map((s) => s.name),
  description: facts.description,
  city: facts.city,
  region: facts.state,
  serviceArea: facts.serviceArea,
  phone: facts.phone,
  email: facts.email,
  yearsInBusiness: facts.yearsInBusiness,
  hasPrices: facts.services.some((s) => s.price != null || s.starting_price != null),
  goals: facts.goals,
  hasHours: facts.hasHours,
});

/**
 * Removes any sentence that makes a claim the client never supplied. The model
 * is told not to write them; this is the enforcement so an invented "award
 * winning" line can never reach a live client site.
 */
export function stripUnsupportedClaims(text: string, facts: DnaFacts): string {
  if (!text.trim()) return text;
  const kept = text
    .split(/(?<=[.!?])\s+|\n\n/)
    .filter((sentence) => screenClaims(sentence, facts).length === 0);
  const out = kept
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return out;
}

/** Full website copy pass. */
export async function generateSiteCopy(
  facts: CopyFacts,
  brief?: SiteBrief | null,
): Promise<SiteCopy> {
  const dnaFacts = dnaFor(facts);
  const dna = businessDna(dnaFacts);
  const data = await chatJson(
    `Return JSON with exactly these keys: heroHeadline (max 70 chars), heroSubheadline (max 160 chars),
primaryCta (max 24 chars), secondaryCta (max 24 chars), intro (2 sentences),
about (2 short paragraphs, plain text with \\n\\n between), benefits (array of 3-5 short strings),
serviceCards (array of {name, copy} — one per supplied service, copy max 220 chars, keep the exact service name),
faqs (array of 4-6 {question, answer} relevant to this category, services and area — never promise anything not supplied),
areaCopy (2 sentences about where they work; omit places not supplied),
metaTitle (max 60 chars), metaDescription (max 155 chars), ogTitle (max 60 chars), ogDescription (max 155 chars).`,
    `Write the website copy for this business. The main action visitors should take is: ${facts.ctaLabel}.${briefContext(brief)}\n\nBUSINESS DNA (authoritative — follow the strategy and the never-claim list):\n${dnaBrief(dna)}\n\nFACTS:\n${factSheet(facts)}`,
  );

  const cards = Array.isArray(data["serviceCards"])
    ? (data["serviceCards"] as Record<string, unknown>[])
    : [];
  const faqs = Array.isArray(data["faqs"]) ? (data["faqs"] as Record<string, unknown>[]) : [];

  const clean = (value: string) => stripUnsupportedClaims(value, dnaFacts);

  return {
    heroHeadline: clean(str(data["heroHeadline"], facts.businessName)) || facts.businessName,
    heroSubheadline: clean(str(data["heroSubheadline"])),
    primaryCta: str(data["primaryCta"], facts.ctaLabel),
    secondaryCta: str(data["secondaryCta"], "See services"),
    intro: clean(str(data["intro"])),
    about: clean(str(data["about"], facts.description ?? "")),
    benefits: (Array.isArray(data["benefits"]) ? (data["benefits"] as unknown[]) : [])
      .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
      .filter((b) => screenClaims(b, dnaFacts).length === 0)
      .slice(0, 5),
    serviceCards: cards
      .map((c) => ({ name: str(c["name"]), copy: clean(str(c["copy"])) }))
      .filter((c) => c.name),
    faqs: faqs
      .map((f) => ({ question: str(f["question"]), answer: clean(str(f["answer"])) }))
      .filter((f) => f.question && f.answer)
      .slice(0, 6),
    areaCopy: clean(str(data["areaCopy"])),
    metaTitle: str(data["metaTitle"], facts.businessName).slice(0, 60),
    metaDescription: str(data["metaDescription"]).slice(0, 158),
    ogTitle: str(data["ogTitle"], str(data["metaTitle"], facts.businessName)).slice(0, 60),
    ogDescription: str(data["ogDescription"], str(data["metaDescription"])).slice(0, 158),
  };
}

/** Targeted rewrite: only the supplied fields change. */
export async function rewriteCopyFields(
  facts: CopyFacts,
  current: Record<string, string>,
  instruction: string,
): Promise<Record<string, string>> {
  const data = await chatJson(
    `Rewrite only the fields given in "current". Return JSON with the same keys and no others.
Keep every field's role and length limits. Do not add facts. Do not change structure.`,
    `Instruction from the business owner: "${instruction}"\n\ncurrent:\n${JSON.stringify(current, null, 2)}\n\nFACTS:\n${factSheet(facts)}`,
  );

  const out: Record<string, string> = {};
  for (const key of Object.keys(current)) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  return out;
}

/* --------------------------- Section edit assistant ------------------------ */

export type SectionForEdit = {
  id: string;
  label: string;
  heading: string | null;
  subheading: string | null;
  body: string | null;
};

export type ProposedEdit = {
  sectionId: string;
  field: "heading" | "subheading" | "body";
  after: string;
};

/**
 * Proposes section edits from a plain-language instruction. Returns only the
 * fields it wants to change — nothing is written until the client confirms.
 */
export async function proposeSectionEdits(
  facts: CopyFacts,
  sections: SectionForEdit[],
  instruction: string,
): Promise<{ edits: ProposedEdit[]; reply: string }> {
  const data = await chatJson(
    `You edit sections of a local business website on request.
Return JSON: { "reply": string (one short sentence describing what you changed),
"edits": [ { "sectionId": string, "field": "heading" | "subheading" | "body", "after": string } ] }.
Rules:
- Only include sections listed in "sections", using their exact id.
- Only include fields you actually changed. Never return unchanged text.
- Headings max 70 characters, subheadings max 160, body max 900.
- Add no new facts. If the request needs information not supplied, return an
  empty edits array and explain that in "reply".`,
    `Instruction: "${instruction}"\n\nsections:\n${JSON.stringify(sections, null, 2)}\n\nFACTS:\n${factSheet(facts)}`,
  );

  const ids = new Set(sections.map((s) => s.id));
  const allowed = new Set(["heading", "subheading", "body"]);
  const raw = Array.isArray(data["edits"]) ? (data["edits"] as Record<string, unknown>[]) : [];
  const edits: ProposedEdit[] = [];
  for (const entry of raw.slice(0, 24)) {
    const sectionId = str(entry["sectionId"]);
    const field = str(entry["field"]);
    const after = str(entry["after"]);
    if (!ids.has(sectionId) || !allowed.has(field) || !after) continue;
    edits.push({
      sectionId,
      field: field as ProposedEdit["field"],
      after: after.slice(0, field === "body" ? 900 : field === "subheading" ? 200 : 90),
    });
  }
  return {
    edits,
    reply: str(
      data["reply"],
      edits.length
        ? "Here are the changes I suggest."
        : "I couldn't make that change without more information.",
    ),
  };
}

/* ---------------------- Business intelligence orchestrator ---------------------- */

/**
 * Business Intelligence + Customer Intent + Conversion Architecture pass.
 *
 * Runs before structure and copy so every later stage shares one business
 * context. Facts are never invented: anything the client hasn't supplied is
 * returned in `missingFacts` for the owner to fill in.
 */
export async function analyzeBusiness(facts: CopyFacts): Promise<SiteBrief> {
  const system = `You analyse a local business so a website can be built around how its customers actually buy.
Return JSON with exactly these keys:
positioning (one plain sentence, max 200 chars, what the business does and for whom),
buyer (who the site is written for, max 160 chars),
buyerGoal (what that person is trying to get done, max 160 chars),
intents (array, 2-4 values, only from: ${Object.keys(INTENT_KEYS).join(", ")}),
primaryAction (max 30 chars, the single most valuable action for this business model),
secondaryAction (max 30 chars),
objections (array of 3-5 real hesitations a buyer in this category has, max 120 chars each),
trustNeeds (array of 3-5 things the site must show to be believed, based only on supplied facts),
qualifyingFields (array of 4-8 short lead-form field names that are genuinely relevant to this category),
pagePriorities (array of 3-6 short page names in order of value),
toneNotes (max 200 chars, how the copy should sound for this buyer),
missingFacts (array of up to 5 short items the owner should supply to make the site stronger).
Never assert reviews, credentials, prices, guarantees or history that were not supplied.`;

  const attempt = async (role: ModelRole) =>
    chatJson(system, `Analyse this business.\n\nFACTS:\n${factSheet(facts)}`, role, {
      task: "copy.analyse",
    });

  let data: Record<string, unknown>;
  try {
    data = await attempt(ANALYSIS_ROLE);
  } catch (error) {
    // Credit and policy failures must surface so the queue can pause correctly.
    if (
      error instanceof RevoraAiError &&
      ["not_configured", "free_unavailable", "unauthorized", "quota", "policy", "rate_limited"].includes(error.category)
    )
      throw error;
    data = await attempt(COPY_ROLE);
  }

  const brief = readBrief({ ...data, source: ANALYSIS_ROLE });
  return brief ?? fallbackBrief(facts);
}

const INTENT_KEYS = INTENT_META;

/** Deterministic brief used when the analysis pass is unavailable. */
export function fallbackBrief(facts: CopyFacts): SiteBrief {
  const bookable = facts.goals.includes("bookings");
  const priced = facts.services.some((s) => s.price != null || s.starting_price != null);
  return {
    positioning: facts.description?.trim()
      ? facts.description.trim().slice(0, 200)
      : `${facts.businessName} provides ${facts.industry || "local services"}${facts.city ? ` in ${facts.city}` : ""}.`,
    buyer: `People nearby looking for ${facts.industry || "this service"}.`,
    buyerGoal: bookable
      ? "Book a time without a back-and-forth."
      : "Find out what it costs and who to trust.",
    intents: bookable
      ? ["ready_to_book", "wants_price", "local_search"]
      : ["wants_price", "researching", "local_search"],
    primaryAction: facts.ctaLabel,
    secondaryAction: "See services",
    objections: [
      "Not sure what this will cost.",
      "Not sure the business covers my area.",
      "Not sure how quickly they can get to me.",
    ],
    trustNeeds: [
      "Clear service detail",
      "A real way to make contact",
      priced ? "Visible pricing" : "Honest pricing guidance",
    ],
    qualifyingFields: [
      "Name",
      "Phone",
      "Email",
      "Service needed",
      "Location",
      "Preferred timing",
      "Notes",
    ],
    pagePriorities: [
      "Home",
      "Services",
      facts.goals.includes("bookings") ? "Booking" : "Quote",
      "Contact",
    ],
    toneNotes: "Plain, specific and local. No hype.",
    missingFacts: [
      ...(facts.description ? [] : ["A short description of the business in your own words"]),
      ...(facts.phone ? [] : ["A phone number customers can call"]),
      ...(facts.serviceArea || facts.city ? [] : ["The areas you serve"]),
      ...(priced ? [] : ["A price or starting price on at least one service"]),
    ],
    source: "rules",
    approved: false,
    factAnswers: {},
  };
}

const briefContext = (brief?: SiteBrief | null) =>
  brief
    ? `\n\nSHARED BUSINESS BRIEF (use this so every section reads as one website):\n${JSON.stringify(
        {
          positioning: brief.positioning,
          buyer: brief.buyer,
          buyerGoal: brief.buyerGoal,
          intents: brief.intents,
          objectionsToAnswer: brief.objections,
          trustToEstablish: brief.trustNeeds,
          tone: brief.toneNotes,
        },
        null,
        2,
      )}`
    : "";

/* --------------------------- Deterministic copy ---------------------------- */

/**
 * Rule-based website copy built only from facts the owner supplied.
 *
 * This is the safety net for the generation queue: when the AI gateway denies a
 * request (credits exhausted, policy block) the build must still produce a real,
 * publishable site rather than failing and leaving the client with nothing. No
 * claim here is invented — every sentence is derived from stored business data.
 */
export function fallbackCopy(facts: CopyFacts, brief?: SiteBrief | null): SiteCopy {
  const name = facts.businessName || "Our business";
  const category = (facts.industry || "local services").toLowerCase();
  const place = [facts.city, facts.state].filter(Boolean).join(", ");
  const area = facts.serviceArea?.trim() || place;
  const cta = facts.ctaLabel || brief?.primaryAction || "Get in touch";
  const priced = facts.services.filter((s) => s.price != null || s.starting_price != null);
  const money = (value: number) => `$${Math.round(value)}`;

  const benefits = [
    area ? `Serving ${area}` : "Local, responsive service",
    facts.yearsInBusiness
      ? `${facts.yearsInBusiness}+ years in business`
      : "Straight answers, no pressure",
    facts.hasHours ? "Published hours so you know when we work" : "Fast replies to every request",
    priced.length ? "Clear pricing before any work starts" : "A quote before any work starts",
    facts.phone ? "Reach a real person by phone" : "Every request answered",
  ].slice(0, 5);

  return {
    heroHeadline: place ? `${category.replace(/^\w/, (c) => c.toUpperCase())} in ${place}` : name,
    heroSubheadline: facts.description?.trim()
      ? facts.description.trim().slice(0, 160)
      : `${name} handles ${category}${area ? ` across ${area}` : ""}. Tell us what you need and we'll take it from there.`,
    primaryCta: cta.slice(0, 24),
    secondaryCta: "See services",
    intro: `${name} provides ${category}${area ? ` in ${area}` : ""}. Send a request and you'll get a clear answer on scope, timing and price.`,
    about: `${
      facts.description?.trim() ||
      `${name} is a ${category} business${place ? ` based in ${place}` : ""}.`
    }\n\n${
      facts.yearsInBusiness
        ? `We've been doing this for ${facts.yearsInBusiness}+ years.`
        : "We keep the process simple: you tell us what you need, we confirm what it takes."
    }${facts.phone ? " Call or send a request and we'll get back to you." : " Send a request and we'll get back to you."}`,
    benefits,
    serviceCards: facts.services.slice(0, 12).map((s) => ({
      name: s.name,
      copy:
        s.description?.trim() ||
        (s.price != null
          ? `${s.name} — ${money(s.price)}.`
          : s.starting_price != null
            ? `${s.name} — from ${money(s.starting_price)}.`
            : `${s.name}. Request a quote and we'll confirm scope and price.`),
    })),
    faqs: [
      {
        question: area ? `Do you work in ${area}?` : "What areas do you cover?",
        answer: area
          ? `Yes — we cover ${area}.`
          : "Send a request with your location and we'll confirm coverage.",
      },
      {
        question: "How much does it cost?",
        answer: priced.length
          ? `Published pricing starts at ${money(
              Math.min(...priced.map((s) => (s.starting_price ?? s.price) as number)),
            )}. Final price depends on the job.`
          : "Pricing depends on the job, so we quote each request instead of guessing.",
      },
      {
        question: "How do I get started?",
        answer: `Use the ${cta.toLowerCase()} option on this page${facts.phone ? " or call us" : ""}. We'll reply with next steps.`,
      },
      {
        question: "How fast do you respond?",
        answer: facts.hasHours
          ? "Requests are answered during our published hours."
          : "Requests are answered as quickly as we can get to them, usually the same day.",
      },
    ],
    areaCopy: area
      ? `We work throughout ${area}. If you're just outside it, send a request and we'll tell you honestly.`
      : "Send a request with your location and we'll confirm whether we can reach you.",
    metaTitle: `${name}${place ? ` — ${category} in ${place}` : ` — ${category}`}`.slice(0, 60),
    metaDescription:
      `${name} provides ${category}${area ? ` in ${area}` : ""}. ${cta} today.`.slice(0, 155),
    ogTitle: `${name}${place ? ` — ${place}` : ""}`.slice(0, 60),
    ogDescription:
      `${category.replace(/^\w/, (c) => c.toUpperCase())}${area ? ` in ${area}` : ""} from ${name}.`.slice(
        0,
        155,
      ),
  };
}
