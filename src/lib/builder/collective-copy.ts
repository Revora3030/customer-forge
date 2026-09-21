/**
 * Fact-locked validation for collective copy refinements.
 *
 * Sol, Terra and Luna may only *improve wording that already describes facts
 * the owner supplied*. This module is the gate between a model's proposal and
 * the deterministic builder: it parses the proposal, throws away anything that
 * invents a claim, a phone number, an email, a price or a service name, and
 * returns only the fields that are safe to merge.
 *
 * It is pure and environment-free so every rule is unit-testable, and the
 * deterministic copy always survives a rejected field untouched.
 */
import { screenClaims, type DnaFacts } from "@/lib/business-dna";
import type { SiteCopy } from "@/lib/site-engine";

/** Text fields a model may rewrite, with their hard length ceilings. */
export const REFINABLE_TEXT_FIELDS = {
  heroHeadline: 90,
  heroSubheadline: 200,
  intro: 700,
  about: 1000,
  areaCopy: 450,
  metaTitle: 65,
  metaDescription: 165,
  ogTitle: 75,
  ogDescription: 210,
} as const satisfies Partial<Record<keyof SiteCopy, number>>;

export type RefinableTextField = keyof typeof REFINABLE_TEXT_FIELDS;

export type CopyRefinement = {
  [K in RefinableTextField]?: string;
} & {
  benefits?: string[];
  serviceCards?: { name: string; copy: string }[];
  faqs?: { question: string; answer: string }[];
};

export type RefinementRejection = { field: string; reason: string };

export type RefinementReview = {
  accepted: CopyRefinement;
  rejected: RefinementRejection[];
};

const trimmed = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length ? value.trim() : null;

/** Reads a model answer that should be a JSON object, tolerating code fences. */
export function parseRefinement(text: string): Record<string, unknown> | null {
  const withoutFence = text
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(withoutFence.slice(start, end + 1)) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const DIGITS = /\d[\d\s().-]{6,}\d/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const MONEY = /(?:\$|usd\s*)\d/i;

const digitsOnly = (value: string) => value.replace(/\D+/g, "");

/**
 * Rejects contact details or prices the owner never supplied. A model that
 * "helpfully" writes a phone number is inventing a business fact.
 */
function inventsDetail(text: string, facts: DnaFacts): string | null {
  const ownPhone = facts.phone ? digitsOnly(facts.phone) : "";
  for (const match of text.match(DIGITS) ?? []) {
    const digits = digitsOnly(match);
    if (digits.length < 7) continue;
    if (ownPhone && (ownPhone.includes(digits) || digits.includes(ownPhone))) continue;
    return "a phone number the business never supplied";
  }
  const ownEmail = facts.email?.trim().toLowerCase() ?? "";
  for (const match of text.match(EMAIL) ?? []) {
    if (match.toLowerCase() === ownEmail) continue;
    return "an email address the business never supplied";
  }
  if (MONEY.test(text) && !facts.hasPrices) return "a price the business never supplied";
  return null;
}

/** Every reason one piece of proposed text may not be used. */
export function screenText(
  text: string,
  facts: DnaFacts,
  maxLength: number,
): string | null {
  if (!text.trim()) return "empty";
  if (text.length > maxLength) return `longer than ${maxLength} characters`;
  const invented = inventsDetail(text, facts);
  if (invented) return invented;
  const claims = screenClaims(text, facts);
  if (claims.length) return `unsupported ${claims[0]!.reason}: “${claims[0]!.text}”`;
  return null;
}

/**
 * Validates a whole proposal against the owner's facts and the deterministic
 * baseline. Service names and FAQ questions are locked: a model may improve the
 * answer, never rename the offer or invent a new question.
 */
export function reviewRefinement(input: {
  proposal: Record<string, unknown> | null;
  facts: DnaFacts;
  baseline: SiteCopy;
  /** Fields a reviewer tier explicitly approved; when given, others are dropped. */
  approvedFields?: string[] | null;
}): RefinementReview {
  const accepted: CopyRefinement = {};
  const rejected: RefinementRejection[] = [];
  const proposal = input.proposal;
  if (!proposal) return { accepted, rejected: [{ field: "*", reason: "unreadable answer" }] };
  const gate = input.approvedFields ? new Set(input.approvedFields) : null;

  const allow = (field: string) => {
    if (gate && !gate.has(field)) {
      rejected.push({ field, reason: "not approved by the review pass" });
      return false;
    }
    return true;
  };

  for (const [field, max] of Object.entries(REFINABLE_TEXT_FIELDS) as [
    RefinableTextField,
    number,
  ][]) {
    const value = trimmed(proposal[field]);
    if (value === null) continue;
    if (value === input.baseline[field]) continue;
    if (!allow(field)) continue;
    const problem = screenText(value, input.facts, max);
    if (problem) {
      rejected.push({ field, reason: problem });
      continue;
    }
    accepted[field] = value;
  }

  const benefits = proposal["benefits"];
  if (Array.isArray(benefits) && allow("benefits")) {
    const values = benefits.map(trimmed).filter((value): value is string => value !== null);
    const problem =
      values.length === 0
        ? "no usable lines"
        : values.length > Math.max(input.baseline.benefits.length, 3)
          ? "more lines than the design supports"
          : (values.map((value) => screenText(value, input.facts, 140)).find(Boolean) ?? null);
    if (problem) rejected.push({ field: "benefits", reason: problem });
    else accepted.benefits = values;
  }

  const cards = proposal["serviceCards"];
  if (Array.isArray(cards) && allow("serviceCards")) {
    const byName = new Map(input.baseline.serviceCards.map((card) => [card.name, card.copy]));
    const next: { name: string; copy: string }[] = [];
    let problem: string | null = null;
    for (const raw of cards) {
      const name = trimmed((raw as { name?: unknown })?.name);
      const copy = trimmed((raw as { copy?: unknown })?.copy);
      if (!name || !copy) {
        problem = "a card is missing its service name or wording";
        break;
      }
      if (!byName.has(name)) {
        problem = `“${name}” is not one of the business's services`;
        break;
      }
      const textProblem = screenText(copy, input.facts, 320);
      if (textProblem) {
        problem = `${name}: ${textProblem}`;
        break;
      }
      next.push({ name, copy });
    }
    // Every supplied service must still be present, in the same order.
    if (!problem && next.length !== input.baseline.serviceCards.length)
      problem = "a supplied service is missing";
    if (
      !problem &&
      next.some((card, index) => card.name !== input.baseline.serviceCards[index]?.name)
    )
      problem = "the services were reordered or renamed";
    if (problem) rejected.push({ field: "serviceCards", reason: problem });
    else if (next.length) accepted.serviceCards = next;
  }

  const faqs = proposal["faqs"];
  if (Array.isArray(faqs) && allow("faqs")) {
    const questions = input.baseline.faqs.map((faq) => faq.question);
    const next: { question: string; answer: string }[] = [];
    let problem: string | null = null;
    for (const raw of faqs) {
      const question = trimmed((raw as { question?: unknown })?.question);
      const answer = trimmed((raw as { answer?: unknown })?.answer);
      if (!question || !answer) {
        problem = "a question is missing its wording or answer";
        break;
      }
      if (!questions.includes(question)) {
        problem = "a question the build never planned";
        break;
      }
      const textProblem = screenText(answer, input.facts, 480);
      if (textProblem) {
        problem = textProblem;
        break;
      }
      next.push({ question, answer });
    }
    if (!problem && next.length !== input.baseline.faqs.length)
      problem = "a planned question is missing";
    if (problem) rejected.push({ field: "faqs", reason: problem });
    else if (next.length) accepted.faqs = next;
  }

  return { accepted, rejected };
}

/** Applies accepted wording to the deterministic copy. Never mutates input. */
export function mergeRefinement(copy: SiteCopy, accepted: CopyRefinement): SiteCopy {
  const next: SiteCopy = {
    ...copy,
    benefits: [...copy.benefits],
    serviceCards: copy.serviceCards.map((card) => ({ ...card })),
    faqs: copy.faqs.map((faq) => ({ ...faq })),
  };
  for (const field of Object.keys(REFINABLE_TEXT_FIELDS) as RefinableTextField[]) {
    const value = accepted[field];
    if (value) next[field] = value;
  }
  if (accepted.benefits?.length) next.benefits = [...accepted.benefits];
  if (accepted.serviceCards?.length)
    next.serviceCards = accepted.serviceCards.map((card) => ({ ...card }));
  if (accepted.faqs?.length) next.faqs = accepted.faqs.map((faq) => ({ ...faq }));
  return next;
}

/** Field names the reviewer tier is allowed to approve. */
export function approvableFields(proposal: Record<string, unknown> | null): string[] {
  if (!proposal) return [];
  const allowed = new Set<string>([
    ...Object.keys(REFINABLE_TEXT_FIELDS),
    "benefits",
    "serviceCards",
    "faqs",
  ]);
  return Object.keys(proposal).filter((key) => allowed.has(key));
}

/** Reads a reviewer answer: which fields it approved, and why it refused others. */
export function parseReview(text: string): {
  approvedFields: string[];
  notes: RefinementRejection[];
} | null {
  const parsed = parseRefinement(text);
  if (!parsed) return null;
  const approvedRaw = parsed["approvedFields"] ?? parsed["approved"];
  if (!Array.isArray(approvedRaw)) return null;
  const approvedFields = approvedRaw
    .map(trimmed)
    .filter((value): value is string => value !== null);
  const notesRaw = parsed["rejected"] ?? parsed["notes"];
  const notes = Array.isArray(notesRaw)
    ? notesRaw
        .map((entry) => ({
          field: trimmed((entry as { field?: unknown })?.field) ?? "*",
          reason: trimmed((entry as { reason?: unknown })?.reason) ?? "rejected by review",
        }))
        .slice(0, 20)
    : [];
  return { approvedFields, notes };
}
