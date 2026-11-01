/**
 * FAQ answers grounded in the business's own facts.
 *
 * An FAQ answer reaches a visitor only when it is backed by something the
 * owner actually supplied: the business profile (hours, area, phone,
 * licences…), the Services tool (names and prices), the live booking or
 * quote tools, or the owner's own answers kept with the site brief. Nothing
 * here invents a fact, a price or a review.
 *
 * - An authored answer is kept when every figure, price and claim in it can
 *   be found in those facts.
 * - Otherwise (or when the answer is empty or a placeholder) a deterministic
 *   answer is built from the matching fact, when one exists.
 * - Otherwise the question has no answer: published pages (/s and /p) drop
 *   it, and the owner's draft preview shows a clearly marked placeholder.
 */
import { businessFacts, factsAddressLine, isSupportedClaim, type RawProfile } from "@/lib/builder/facts";
import { currency } from "@/lib/format";

/** The marker an unanswered question carries in the owner's draft preview. */
export const OWNER_TO_ANSWER = "[Owner to answer]";

export type FaqService = { name?: string | null; price?: number | string | null; starting_price?: number | string | null; bookable?: boolean | null };

export type FaqFacts = {
  businessName: string | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  serviceArea: string | null;
  hours: string | null;
  yearsInBusiness: string | null;
  certifications: string | null;
  awards: string | null;
  services: { name: string; price: string | null; from: boolean }[];
  booking: boolean;
  quote: boolean;
  /** The owner's own answers kept with the site brief (key → answer). */
  ownerAnswers: Record<string, string>;
  /** Lower-cased text of every fact, for checking an authored answer's figures and claims. */
  corpus: string;
};

export const NO_FAQ_FACTS: FaqFacts = {
  businessName: null, description: null, phone: null, email: null, address: null, city: null, serviceArea: null,
  hours: null, yearsInBusiness: null, certifications: null, awards: null, services: [], booking: false, quote: false,
  ownerAnswers: {}, corpus: "",
};

const money = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const clean = (value: unknown, max = 600): string | null => {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
};

/** Brief keys that are build instructions, not facts about the business. */
const INSTRUCTION_KEYS = new Set(["build_request"]);

/** The facts an FAQ may draw on, from the stored profile, services, tools and brief. */
export function faqFactsFor(input: {
  profile?: RawProfile;
  businessName?: string | null;
  services?: readonly FaqService[] | null;
  quote?: boolean;
  generation?: unknown;
}): FaqFacts {
  const facts = businessFacts(input.profile ?? null, input.businessName ?? undefined);
  const services = (input.services ?? [])
    .map((row) => {
      const name = clean(row.name, 120);
      if (!name) return null;
      const exact = money(row.price);
      const from = money(row.starting_price);
      const amount = exact ?? from;
      return { name, price: amount ? currency(amount) : null, from: exact == null && from != null };
    })
    .filter((row): row is { name: string; price: string | null; from: boolean } => row != null);
  const brief = (input.generation && typeof input.generation === "object" ? (input.generation as Record<string, unknown>)["brief"] : null) as Record<string, unknown> | null;
  const rawAnswers = brief && typeof brief === "object" ? brief["factAnswers"] : null;
  const ownerAnswers: Record<string, string> = {};
  if (rawAnswers && typeof rawAnswers === "object" && !Array.isArray(rawAnswers)) {
    for (const [key, value] of Object.entries(rawAnswers as Record<string, unknown>)) {
      const text = clean(value);
      if (text && !INSTRUCTION_KEYS.has(key)) ownerAnswers[key] = text;
    }
  }
  const certifications = isSupportedClaim(facts.certifications) ? facts.certifications : null;
  const awards = isSupportedClaim(facts.awards) ? facts.awards : null;
  const out: Omit<FaqFacts, "corpus"> = {
    businessName: facts.businessName,
    description: facts.description,
    phone: facts.phone,
    email: facts.email,
    address: factsAddressLine(facts),
    city: facts.city,
    serviceArea: facts.serviceArea,
    hours: facts.hours,
    yearsInBusiness: facts.yearsInBusiness,
    certifications,
    awards,
    services,
    booking: (input.services ?? []).some((row) => Boolean(row.bookable)),
    quote: Boolean(input.quote),
    ownerAnswers,
  };
  const corpus = [
    out.businessName, out.description, out.phone, out.email, out.address, out.city, out.serviceArea, out.hours,
    out.yearsInBusiness, certifications, awards, facts.tagline,
    ...services.flatMap((service) => [service.name, service.price]),
    ...Object.values(ownerAnswers),
  ].filter(Boolean).join(" \n ").toLowerCase();
  return { ...out, corpus };
}

/** Empty, or a stand-in such as "[Owner to answer]", "TBD", "{{price}}" or lorem ipsum. */
export function isPlaceholderAnswer(answer: string | null | undefined): boolean {
  const text = (answer ?? "").replace(/\s+/g, " ").trim();
  if (!text) return true;
  if (/\[[^\]]{1,40}\]|\{\{[^}]*\}\}|<[^>]{1,30}>/.test(text)) return true;
  return /^(?:tbd|tbc|todo|n\/a|na|coming soon|to be (?:confirmed|added|answered)|owner to answer|answer (?:here|coming)|lorem ipsum)\b/i.test(text) || /lorem ipsum/i.test(text);
}

const PRICE = /(?:[$€£¥₹]\s?\d[\d,.]*|\d[\d,.]*\s?(?:usd|eur|gbp|dollars?|euros?|pounds?)\b)/gi;
const REVIEW_CLAIM = /(?:\b\d(?:\.\d)?\s*(?:\/\s*5|stars?|-star)|\bfive[- ]star|\b(?:reviews?|rated|ratings?|rate us|testimonials?)\b|★)/i;
/** Claims an AI likes to add that need the owner's own word. */
const CLAIMS: [RegExp, RegExp][] = [
  [/\blicen[cs]ed?\b/i, /licen[cs]/],
  [/\binsured\b|\binsurance\b/i, /insur/],
  [/\bbonded\b/i, /bonded/],
  [/\bcertified\b|\bcertification/i, /certif/],
  [/\baccredited\b|\baccreditation/i, /accredit/],
  [/\baward(?:s|-winning)?\b/i, /award/],
  [/\bguarantee[ds]?\b/i, /guarantee/],
  [/\bwarrant(?:y|ies)\b/i, /warrant/],
  [/\bfree (?:estimates?|quotes?|consultations?)\b/i, /free (?:estimate|quote|consultation)/],
  [/\b24\s*\/\s*7\b|\bround[- ]the[- ]clock\b/i, /24\s*\/\s*7|round[- ]the[- ]clock|24 hours/],
  [/\bsame[- ]day\b/i, /same[- ]day/],
  [/\bfamily[- ]owned\b/i, /family[- ]owned/],
];

const digits = (text: string) => text.replace(/[^\d]/g, "");

/**
 * Why an authored answer (to `question`) is not backed by the facts, or null when it is.
 * Every number and price must appear in the facts, review claims are never
 * allowed in an FAQ answer, and stock claims (licensed, insured, guaranteed,
 * 24/7…) need the owner to have said so.
 */
export function unsupportedClaim(answer: string, facts: FaqFacts, question = ""): string | null {
  const corpus = facts.corpus;
  const corpusDigits = corpus.match(/\d[\d,.]*/g)?.map(digits) ?? [];
  const knownNumber = (value: string) => {
    const d = digits(value);
    return !d || corpusDigits.some((known) => known === d || (d.length >= 7 && known.includes(d)));
  };
  // A bare "Yes." to "Do you offer a warranty?" makes the question's claim, so claims are read from both.
  const said = `${question} ${answer}`;
  if (REVIEW_CLAIM.test(said)) return "reviews and ratings are never claimed in an FAQ answer";
  for (const [claim, evidence] of CLAIMS) if (claim.test(said) && !evidence.test(corpus)) return `claim "${said.match(claim)?.[0]}" is not in the business facts`;
  for (const price of answer.match(PRICE) ?? []) if (!knownNumber(price)) return `price ${price.trim()} is not in the business facts`;
  for (const number of answer.match(/\d[\d,.]*/g) ?? []) {
    // "8:00" is read as 8 and 00; the minutes alone prove nothing either way.
    if (/^0+$/.test(digits(number))) continue;
    if (!knownNumber(number)) return `figure ${number.replace(/[.,]$/, "")} is not in the business facts`;
  }
  return null;
}

const words = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2);

/** The owner's own answer to a question like this one (word overlap with the brief's question key). */
function ownerAnswerFor(question: string, facts: FaqFacts): string | null {
  const asked = new Set(words(question));
  let best: { score: number; answer: string } | null = null;
  for (const [key, answer] of Object.entries(facts.ownerAnswers)) {
    const keyWords = words(key.replace(/_/g, " "));
    if (!keyWords.length) continue;
    const score = keyWords.filter((w) => asked.has(w)).length / keyWords.length;
    if (score >= 0.6 && (!best || score > best.score)) best = { score, answer };
  }
  return best?.answer ?? null;
}

const list = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/**
 * A deterministic answer built only from the facts, or null when the facts
 * do not answer the question. Topic is read from the question's wording.
 */
export function answerFromFacts(question: string, facts: FaqFacts): string | null {
  const q = question.toLowerCase();
  const owner = ownerAnswerFor(question, facts);
  if (owner) return owner;
  const priced = facts.services.filter((service) => service.price);
  if (/\b(price|prices|pricing|cost|costs|charge|rates?|how much|fee|fees)\b/.test(q)) {
    const named = priced.find((service) => q.includes(service.name.toLowerCase()));
    if (named) return `${named.name} ${named.from ? "starts at" : "is"} ${named.price}.`;
    if (priced.length) return `${list(priced.slice(0, 3).map((service) => `${service.name}: ${service.from ? "from " : ""}${service.price}`))}.`;
    if (facts.quote) return "Prices depend on the job. Use the instant quote form on this site for an estimate.";
    return null;
  }
  if (/\b(hours|open|opening|close|closing)\b|\bwhen (?:are|can) you\b/.test(q)) return facts.hours ? `Our hours are ${facts.hours}.` : null;
  if (/\b(area|areas|serve|service area|cover|travel|come to|near me|which towns|what towns)\b/.test(q))
    return facts.serviceArea ? `We serve ${facts.serviceArea}.` : null;
  if (/\b(where are you|address|located|location|find you|visit)\b/.test(q))
    return facts.address ? `You'll find us at ${facts.address}.` : facts.city ? `We're based in ${facts.city}.` : null;
  if (/\b(licen[cs]ed|insured|insurance|certified|certification|accredit|qualified|qualifications)\b/.test(q))
    return facts.certifications ? `${facts.certifications}.`.replace(/\.\.$/, ".") : null;
  if (/\b(awards?)\b/.test(q)) return facts.awards ? `${facts.awards}.`.replace(/\.\.$/, ".") : null;
  if (/\b(how long|experience|years|established|founded)\b/.test(q))
    return facts.yearsInBusiness ? `${facts.businessName ?? "We"} ${facts.businessName ? "has" : "have"} ${facts.yearsInBusiness} in business.` : null;
  if (/\b(book|booking|appointment|schedule|reserve)\b/.test(q)) {
    if (facts.booking) return "Yes. Pick a service and a time in the booking form on this site.";
    return facts.phone ? `Call ${facts.phone} to book.` : null;
  }
  if (/\b(quote|estimate)\b/.test(q)) {
    if (facts.quote) return "Use the instant quote form on this site to get an estimate.";
    return facts.phone ? `Call ${facts.phone} for a quote.` : facts.email ? `Email ${facts.email} for a quote.` : null;
  }
  if (/\b(contact|reach|call|phone|email|get in touch)\b/.test(q)) {
    const ways = [facts.phone ? `call ${facts.phone}` : null, facts.email ? `email ${facts.email}` : null].filter((way): way is string => !!way);
    return ways.length ? `You can ${ways.join(" or ")}.` : null;
  }
  if (/\b(what (?:services|do you (?:offer|do))|which services|services do you)\b/.test(q))
    return facts.services.length ? `We offer ${list(facts.services.slice(0, 6).map((service) => service.name))}.` : null;
  return null;
}

export type GroundedFaq = { question: string; answer: string | null; source: "authored" | "facts" | null; reason?: string };

/** One FAQ item, grounded: the authored answer when the facts back it, else a fact answer, else none. */
export function groundFaqItem(item: { question: string; answer: string }, facts: FaqFacts): GroundedFaq {
  const question = item.question.trim();
  const authored = item.answer?.trim() ?? "";
  let reason: string | undefined;
  if (!isPlaceholderAnswer(authored)) {
    const problem = unsupportedClaim(authored, facts, question);
    if (!problem) return { question, answer: authored, source: "authored" };
    reason = problem;
  } else reason = "no answer was supplied";
  const fromFacts = answerFromFacts(question, facts);
  if (fromFacts) return { question, answer: fromFacts, source: "facts" };
  return { question, answer: null, source: null, ...(reason ? { reason } : {}) };
}

export type FaqDisplayItem = { question: string; answer: string; defaultOpen?: boolean; placeholder?: true };

/**
 * The FAQ items a page shows. Published pages drop an unanswered question;
 * the owner's draft preview keeps it with a clearly marked placeholder.
 */
export function faqItemsForDisplay<T extends { question: string; answer: string; defaultOpen?: boolean }>(
  items: readonly T[],
  facts: FaqFacts,
  mode: "published" | "draft",
): FaqDisplayItem[] {
  const out: FaqDisplayItem[] = [];
  for (const item of items) {
    if (!item.question?.trim()) continue;
    const grounded = groundFaqItem(item, facts);
    const open = item.defaultOpen ? { defaultOpen: true } : {};
    if (grounded.answer) out.push({ question: grounded.question, answer: grounded.answer, ...open });
    else if (mode === "draft") out.push({ question: grounded.question, answer: OWNER_TO_ANSWER, placeholder: true });
  }
  return out;
}
