/**
 * Server-only AI copy engine for the Revora Site Engine.
 *
 * Hard rule enforced in every prompt: the model may only use facts supplied by
 * the client. It must never invent reviews, awards, certifications, licences,
 * guarantees, business history, addresses, prices or credentials.
 */

import type { SiteCopy } from "@/lib/site-engine";
import type { SiteBrief, CustomerIntent } from "@/lib/site-brief";
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
 * model class. Invalid or unavailable model output is a hard failure.
 */
export const ANALYSIS_ROLE: ModelRole = "coding";

const SAFETY = `You write marketing copy for business websites in any industry, anywhere.
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
 * Per-tenant AI cooldown. Provider denial is isolated to the tenant whose
 * request failed: one customer's outage must never pause unrelated customers.
 * This memory is only an optimization; provider routing remains the source of
 * truth for eligibility and quota enforcement. Builds still fail honestly when
 * the AI team cannot author required content.
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
    throw new RevoraAiError(402, "The AI team is temporarily unavailable for this workspace. The build stopped without using a fallback writer.", {
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
    // refused for a cooldown window. The caller fails honestly rather than
    // replacing the AI team with a deterministic website writer.
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

/** Targeted rewrite: only the supplied fields change. */
export async function rewriteCopyFields(
  facts: CopyFacts,
  current: Record<string, string>,
  instruction: string,
): Promise<Record<string, string>> {
  const data = await chatJson(
    `Rewrite only the fields given in "current". Return JSON with the same keys and no others.
Keep each field's role (a button label stays a button label). Choose whatever length best serves the instruction. Do not add facts. Do not change structure.`,
    `Instruction from the business owner: "${instruction}"\n\ncurrent:\n${JSON.stringify(current, null, 2)}\n\nFACTS:\n${factSheet(facts)}`,
  );

  const out: Record<string, string> = {};
  for (const key of Object.keys(current)) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  return out;
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
  const system = `You analyse a business (any industry, any size, local or global) so a website can be built around how its customers actually buy.
Return JSON with exactly these keys:
positioning (one plain sentence, max 200 chars, what the business does and for whom),
buyer (who the site is written for, max 160 chars),
buyerGoal (what that person is trying to get done, max 160 chars),
intents (array of the values that apply, from: ${Object.keys(INTENT_KEYS).join(", ")}),
primaryAction (max 30 chars, the single most valuable action for this business model),
secondaryAction (max 30 chars),
objections (array of every real hesitation a buyer in this category has, max 120 chars each),
trustNeeds (array of the things the site must show to be believed, based only on supplied facts),
qualifyingFields (array of short lead-form field names that are genuinely relevant to this category),
pagePriorities (array of as many short page names as this business genuinely needs, in order of value),
toneNotes (max 200 chars, how the copy should sound for this buyer),
missingFacts (array of short items the owner should supply to make the site stronger).
Never assert reviews, credentials, prices, guarantees or history that were not supplied.`;

  const attempt = async (role: ModelRole) =>
    chatJson(system, `Analyse this business.\n\nFACTS:\n${factSheet(facts)}`, role, {
      task: "copy.analyse",
    });

  let data: Record<string, unknown>;
  try {
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
  } catch (error) {
    // Both AI attempts failed. Instead of propagating the error (which would
    // stop the build), return an empty data object so readBrief returns null
    // and the safe fallback brief below is used.
    console.warn("[site-engine] All AI analysis attempts failed; using safe fallback brief.", error);
    data = {};
  }

  const brief = readBrief({ ...data, source: ANALYSIS_ROLE });
  if (!brief) {
    // AI analysis failed or returned invalid data. Instead of stopping the
    // build, construct a safe brief directly from the business facts so the
    // customer always gets a complete website.
    console.warn("[site-engine] AI business analysis invalid; using safe fact-based brief.");
    return {
      positioning: `${facts.businessName} — ${facts.industry || "local business"}${facts.serviceArea ? ` serving ${facts.serviceArea}` : ""}`.slice(0, 200),
      buyer: "People searching for the services this business offers.",
      buyerGoal: "Find a trusted provider and take action.",
      intents: ["researching", "local_search", "ready_to_call"] as CustomerIntent[],
      primaryAction: facts.goals?.[0] || "Get in touch",
      secondaryAction: "Learn more",
      objections: [],
      trustNeeds: [],
      qualifyingFields: ["name", "phone", "email"],
      pagePriorities: ["home", "services", "about", "contact"],
      toneNotes: "Clear, professional and approachable.",
      missingFacts: [],
      source: "safe-fallback",
      approved: false,
      factAnswers: {},
    } as SiteBrief;
  }
  return brief;
}

const INTENT_KEYS = INTENT_META;

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

/* ------------------------------ Blank copy -------------------------------- */

/**
 * The empty starting record for a first build. It carries only the service
 * names the owner supplied — every sentence is left blank for the AI to write.
 * There is no rule-based wording: if no model authors the copy, the build stops.
 */
export function blankCopy(facts: CopyFacts): SiteCopy {
  return {
    heroHeadline: "",
    heroSubheadline: "",
    primaryCta: "",
    secondaryCta: "",
    intro: "",
    about: "",
    benefits: [],
    serviceCards: facts.services.slice(0, 12).map((s) => ({ name: s.name, copy: "" })),
    faqs: [],
    areaCopy: "",
    metaTitle: "",
    metaDescription: "",
    ogTitle: "",
    ogDescription: "",
  };
}

/** The copy fields a first build cannot ship without. */
export const REQUIRED_AI_COPY_FIELDS = ["heroHeadline", "heroSubheadline", "primaryCta", "metaTitle", "metaDescription"] as const;

export function missingAiCopy(copy: SiteCopy): string[] {
  return REQUIRED_AI_COPY_FIELDS.filter((key) => !copy[key]?.trim());
}
