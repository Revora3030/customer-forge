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

/** Full website copy pass. */
export async function generateSiteCopy(
  facts: CopyFacts,
  brief?: SiteBrief | null,
): Promise<SiteCopy> {
  const dnaFacts = dnaFor(facts);
  const dna = businessDna(dnaFacts);
  const actionInstruction = facts.ctaLabel.trim()
    ? `The owner-supplied action label is: ${facts.ctaLabel}.`
    : "Author the primary and secondary button labels yourself from the supplied facts and conversion goal.";
  const data = await chatJson(
    `Return JSON with exactly these keys: heroHeadline (max 70 chars), heroSubheadline (max 160 chars),
primaryCta (max 24 chars), secondaryCta (max 24 chars), intro (2 sentences),
about (2 short paragraphs, plain text with \\n\\n between), benefits (array of 3-5 short strings),
serviceCards (array of {name, copy} — one per supplied service, copy max 220 chars, keep the exact service name),
faqs (array of 4-6 {question, answer} relevant to this category, services and area — never promise anything not supplied),
areaCopy (2 sentences about where they work; omit places not supplied),
metaTitle (max 60 chars), metaDescription (max 155 chars), ogTitle (max 60 chars), ogDescription (max 155 chars).`,
    `Write the website copy for this business. ${actionInstruction}${briefContext(brief)}\n\nBUSINESS FACTS AND SAFETY LEDGER (do not treat this as a wording template):\n${dnaBrief(dna)}\n\nFACTS:\n${factSheet(facts)}`,
  );

  const cards = Array.isArray(data["serviceCards"])
    ? (data["serviceCards"] as Record<string, unknown>[])
    : [];
  const faqs = Array.isArray(data["faqs"]) ? (data["faqs"] as Record<string, unknown>[]) : [];

  const clean = (value: string) => stripUnsupportedClaims(value, dnaFacts);

  return {
    heroHeadline: clean(str(data["heroHeadline"])),
    heroSubheadline: clean(str(data["heroSubheadline"])),
    primaryCta: str(data["primaryCta"]),
    secondaryCta: str(data["secondaryCta"]),
    intro: clean(str(data["intro"])),
    about: clean(str(data["about"])),
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
    metaTitle: str(data["metaTitle"]).slice(0, 60),
    metaDescription: str(data["metaDescription"]).slice(0, 158),
    ogTitle: str(data["ogTitle"], str(data["metaTitle"])).slice(0, 60),
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
    `You edit sections of a business website on request.
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
  const system = `You analyse a business (any industry, any size, local or global) so a website can be built around how its customers actually buy.
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
  if (!brief) throw new Error("The AI business analysis was invalid. The build stopped without a fallback brief.");
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
