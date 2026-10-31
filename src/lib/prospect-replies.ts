import { GROWTH_SYSTEM, usd } from "@/lib/offer";
import { isPlatformEmailDomain } from "@/lib/prospect-email";

/**
 * Pure rules for prospect replies: intent, risk flags, the facts sheet every
 * automatic reply is limited to, the deterministic fact check, and the
 * guardrails that decide between an automatic reply and an operator draft.
 *
 * Safety rules:
 * - a stop/unsubscribe/remove-me reply is "stop" whatever the AI says, and is
 *   never answered;
 * - NOTHING is sent automatically: every AI reply is saved as a draft and goes
 *   out only when a super-admin approves that specific item. autoReplyDecision
 *   only says whether the AI may DRAFT a reply (positive, price and question
 *   intents, never with a legal, anger or refund flag);
 * - an automatic reply may state only what the facts sheet holds; any other
 *   link, price, phone number, address or promise sends it to a draft.
 */

export const INBOUND_INTENTS = ["positive", "price", "question", "objection", "stop", "unclear"] as const;
export type InboundIntent = (typeof INBOUND_INTENTS)[number];
export const AUTO_REPLY_INTENTS: ReadonlySet<InboundIntent> = new Set(["positive", "price", "question"]);
export const MAX_AUTO_REPLIES_PER_THREAD = 2;
export const MAX_REPLY_CHARS = 1200;

/** Canonical refund policy. The only refund wording a reply may use. */
export const REFUND_POLICY =
  "Your $350 setup fee is fully refundable within 7 days if we haven't started your build. Your monthly plan is month-to-month, so cancel anytime and you won't be billed again. Charges already made aren't refunded.";

export type InboundFlag = "legal" | "anger" | "auto_submitted" | "refund";

// Straight or curly apostrophes. "Don't stop" isn't a stop and "take us off-site" isn't "take us off".
// "remove us" / "take us off" only count with a list-like object or at the end of a
// sentence: "remove us from the testimonials" is a site edit, not an opt-out.
// "don't stop" is praise unless a contact verb follows ("if you don't stop emailing me").
const LIST_OBJECT = String.raw`(?:\s+(?:from|off)?\s*(?:your|the|this|that|all|any)\s+(?:\w+\s+)?(?:list|lists|mailing\w*|e-?mails?|database|contacts?|outreach|system)\b|\s+off-?list\b|(?=[\s.!]*(?:$|\n)))`;
const STOP_PATTERN = new RegExp(
  String.raw`\b((?<!\b(?:don['’]?t|do\s+not)\s+)stop|(?:don['’]?t|do\s+not)\s+stop\s+(?:e-?mail|contact|messag|writ|send|spam|text|call)\w*|unsubscri\w*|unsub|remove\s+me|remove\s+us${LIST_OBJECT}|take\s+me\s+off(?:-?list\b|(?![-\w]))|take\s+us\s+off(?:-?list\b|${LIST_OBJECT})|opt[\s_-]?out|opt\s+(?:me|us)\s+out|(?:do\s+not|don['’]?t)\s+(?:contact|email|e-mail|message|write)|no\s+more\s+e-?mails?|leave\s+(?:me|us)\s+alone|not\s+interested\s*,?\s*(?:please\s+)?stop)\b`,
  "i",
);

/** Deterministic override: any stop/unsubscribe/remove-me wording is a stop. */
export function keywordIntent(text: string, subject = ""): "stop" | null {
  const haystack = `${subject}\n${text}`;
  return STOP_PATTERN.test(haystack) ? "stop" : null;
}

const LEGAL_PATTERN = /\b(lawyer|attorney|lawsuit|sue|suing|legal\s+action|cease\s+and\s+desist|ftc|attorney\s+general|report(ing)?\s+you|can-?spam\s+violation|harass\w*|scam\w*|spam\w*)\b/i;
const ANGER_PATTERN = /\b(f+u+c+k\w*|sh[i1]t\w*|wtf|bastard\w*|idiot\w*|stupid|screw\s+you|piss\w*\s+off|go\s+to\s+hell|hell\s+no)\b/i;

/** Refund, money-back or chargeback questions: always a draft the owner reviews. */
const REFUND_PATTERN = /\b(refund\w*|money[\s-]?back|charge[\s-]?backs?|reimburs\w*|get\s+(?:my|our)\s+money|guarantee[ds]?)\b/i;

/** Legal threats, anger and refund questions: never answered automatically. */
export function riskFlags(text: string, subject = ""): InboundFlag[] {
  const haystack = `${subject}\n${text}`;
  const flags: InboundFlag[] = [];
  if (LEGAL_PATTERN.test(haystack)) flags.push("legal");
  const letters = text.replace(/[^a-z]/gi, "");
  const shouting = letters.length >= 20 && letters.replace(/[^A-Z]/g, "").length / letters.length > 0.8;
  if (ANGER_PATTERN.test(haystack) || shouting || /!{3,}/.test(text)) flags.push("anger");
  if (REFUND_PATTERN.test(haystack)) flags.push("refund");
  return flags;
}

export function isInboundIntent(value: unknown): value is InboundIntent {
  return typeof value === "string" && (INBOUND_INTENTS as readonly string[]).includes(value);
}

/** Reads the classifier's JSON {intent, confidence}; null when unusable. */
export function parseIntentResponse(raw: string): { intent: InboundIntent; confidence: number } | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { intent?: unknown; confidence?: unknown };
    const intent = typeof parsed.intent === "string" ? parsed.intent.trim().toLowerCase() : "";
    if (!isInboundIntent(intent)) return null;
    const confidence = Number(parsed.confidence);
    return { intent, confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5 };
  } catch {
    return null;
  }
}

/** Below this the AI's intent is treated as unclear (an operator draft). */
export const MIN_INTENT_CONFIDENCE = 0.6;

export type Classification = { intent: InboundIntent; confidence: number; source: "keyword" | "ai" | "fallback" };

/** Final intent: the keyword override wins, then a confident AI answer, else unclear. */
export function resolveIntent(
  text: string,
  subject: string,
  ai: { intent: InboundIntent; confidence: number } | null,
): Classification {
  if (keywordIntent(text, subject)) return { intent: "stop", confidence: 1, source: "keyword" };
  if (!ai) return { intent: "unclear", confidence: 0, source: "fallback" };
  if (ai.intent !== "stop" && ai.confidence < MIN_INTENT_CONFIDENCE) return { intent: "unclear", confidence: ai.confidence, source: "ai" };
  return { intent: ai.intent, confidence: ai.confidence, source: "ai" };
}

export type AutoReplyDecision = { auto: true } | { auto: false; reason: string };

/** Whether an inbound reply may be answered without the operator. */
export function autoReplyDecision(input: {
  intent: InboundIntent;
  flags: readonly string[];
  priorAutoReplies: number;
  demoAvailable: boolean;
}): AutoReplyDecision {
  if (input.intent === "stop") return { auto: false, reason: "stop" };
  if (input.flags.includes("legal")) return { auto: false, reason: "legal_threat" };
  if (input.flags.includes("anger")) return { auto: false, reason: "anger" };
  if (input.flags.includes("auto_submitted")) return { auto: false, reason: "auto_submitted" };
  if (input.flags.includes("refund")) return { auto: false, reason: "refund_question" };
  if (!AUTO_REPLY_INTENTS.has(input.intent)) return { auto: false, reason: `intent_${input.intent}` };
  if (input.priorAutoReplies >= MAX_AUTO_REPLIES_PER_THREAD) return { auto: false, reason: "auto_reply_limit" };
  if (!input.demoAvailable) return { auto: false, reason: "demo_unavailable" };
  return { auto: true };
}

export type FactsSheet = {
  businessName: string;
  plan: string;
  setupPrice: string;
  monthlyPrice: string;
  firstMonth: string;
  fullAccessTrial: string;
  cancel: string;
  /** The one canonical refund/cancellation policy; a reply about refunds quotes only this. */
  refundPolicy: string;
  setupIncludes: readonly string[];
  monthlyIncludes: readonly string[];
  previewUrl: string;
  claimUrl: string;
  senderName: string;
  senderEmail: string;
  company: string;
  /**
   * The host of the business's own website when its profile has one (lowercase,
   * no "www."). A reply may name that domain: it is the prospect's own site.
   * Never a listing/social platform (a Facebook page is not their domain).
   */
  businessDomain?: string | null;
};

/** Host of a website address, lowercase without "www."; null when unusable. */
export function websiteHost(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
    return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

/** The business's own website domain for the facts sheet: never a listing or social platform. */
export function businessDomainFor(website: string | null | undefined): string | null {
  const host = websiteHost(website);
  return host && !isPlatformEmailDomain(host) ? host : null;
}

/** The only facts an automatic reply may state. Prices come from the one offer. */
export function buildFactsSheet(input: {
  businessName: string;
  previewUrl: string;
  claimUrl: string;
  senderName?: string | null | undefined;
  senderEmail: string;
  businessWebsite?: string | null | undefined;
}): FactsSheet {
  const businessDomain = businessDomainFor(input.businessWebsite);
  return {
    businessName: input.businessName,
    plan: GROWTH_SYSTEM.name,
    setupPrice: `${usd(GROWTH_SYSTEM.setupPrice)} one-time setup`,
    monthlyPrice: `${usd(GROWTH_SYSTEM.monthlyPrice)}/month`,
    firstMonth: `The first month of the ${usd(GROWTH_SYSTEM.monthlyPrice)}/month platform fee is free; monthly billing starts in month two.`,
    fullAccessTrial: `Claiming the draft includes ${GROWTH_SYSTEM.fullAccessWindow} of free full access.`,
    cancel: "Cancel anytime. No hidden fees.",
    refundPolicy: REFUND_POLICY,
    setupIncludes: GROWTH_SYSTEM.setupIncludes,
    monthlyIncludes: GROWTH_SYSTEM.monthlyIncludes,
    previewUrl: input.previewUrl,
    claimUrl: input.claimUrl,
    senderName: input.senderName?.trim() || "Revora Growth Systems",
    senderEmail: input.senderEmail,
    company: "Revora Growth Systems",
    ...(businessDomain ? { businessDomain } : {}),
  };
}

const trimUrl = (url: string) => url.replace(/[.,;:!?)\]}>'"]+$/, "");

/** A web address without a scheme ("calendly.com/x", "www.x.co"); not the domain of an email address. */
const BARE_DOMAIN = /(?<![\w@])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}(?![\w@-])(?:[/?#][^\s<>"']*)?/gi;
/** "(555) 123-4567", "(555)123-4567", "+1 555.123.4567", or a bare 10-11 digit run. */
const PHONE = /(?<!\d)(?:(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|\d{10,11})(?!\d)/;

/**
 * Deterministic part of the fact check: every link, price and contact detail
 * in the reply must come from the facts sheet. Returns the problems found.
 */
export function factCheckReply(body: string, facts: FactsSheet): string[] {
  const problems: string[] = [];
  const text = body.trim();
  if (!text) problems.push("empty reply");
  if (text.length > MAX_REPLY_CHARS) problems.push("reply is too long");
  const allowedUrls = new Set([facts.previewUrl, facts.claimUrl].map(trimUrl));
  // The prospect's own website domain and the sender's mail domain may be named
  // (just the domain, any case, with or without www./a scheme/a trailing slash);
  // a path on them, or any other domain, is still off the sheet.
  const allowedHosts = new Set(
    [facts.businessDomain ? businessDomainFor(facts.businessDomain) : null, websiteHost(facts.senderEmail.slice(facts.senderEmail.lastIndexOf("@") + 1))].filter(
      (host): host is string => Boolean(host),
    ),
  );
  const isAllowedDomain = (address: string) => {
    const bare = address.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    // Only a plain host: no path, query, port or credentials.
    if (/[/?#:@\\]/.test(bare)) return false;
    const host = websiteHost(bare);
    return host !== null && allowedHosts.has(host);
  };
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const url = trimUrl(match[0]);
    if (!allowedUrls.has(url) && !isAllowedDomain(url)) problems.push(`link not in the facts sheet: ${url.slice(0, 120)}`);
  }
  const withoutUrls = text.replace(/https?:\/\/[^\s<>"']+/gi, " ");
  // The facts-sheet links written without their scheme are still the facts-sheet links.
  // Hosts are case-insensitive, so "PREVIEW.revora.app/p/…" is still the preview link.
  const allowedBare = new Set([...allowedUrls].map((url) => url.replace(/^https?:\/\//i, "").toLowerCase()));
  for (const match of withoutUrls.matchAll(BARE_DOMAIN)) {
    const address = trimUrl(match[0]);
    if (!allowedBare.has(address.toLowerCase()) && !isAllowedDomain(address)) problems.push(`bare web address not in the facts sheet: ${address.slice(0, 120)}`);
  }
  // Prices and phone numbers are read with every link removed (a link's digits are not a phone number).
  const rest = withoutUrls.replace(BARE_DOMAIN, " ");
  const allowedAmounts = new Set<number>([GROWTH_SYSTEM.setupPrice, GROWTH_SYSTEM.monthlyPrice]);
  // "$500" or "500$"; a "$" right before a number belongs to that number.
  for (const match of rest.matchAll(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k\b)?|(\d[\d,]*(?:\.\d+)?)\s?(k)?\s?\$(?!\s?\d)/gi)) {
    const amount = Number((match[1] ?? match[3])!.replace(/,/g, "")) * ((match[2] ?? match[4]) ? 1000 : 1);
    if (!allowedAmounts.has(amount)) problems.push(`price not in the facts sheet: ${match[0].trim()}`);
  }
  if (/\b\d+(?:\.\d+)?\s*(dollars|usd|bucks)\b|\busd\s?\$?\d/i.test(rest)) problems.push("price written in words; only the facts-sheet prices may appear");
  if (/[€£¥]|\b(eur|gbp)\s?\d|\d\s*(eur|gbp|euros?)\b/i.test(rest)) problems.push("price in a currency the facts sheet doesn't use");
  if (/\d\s?%|\bpercent\b/i.test(rest)) problems.push("percentages are not in the facts sheet");
  if (PHONE.test(rest)) problems.push("phone number not in the facts sheet");
  for (const match of withoutUrls.matchAll(/[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}/gi)) {
    if (match[0].toLowerCase().replace(/[.]+$/, "") !== facts.senderEmail.toLowerCase()) problems.push(`email address not in the facts sheet: ${match[0]}`);
  }
  if (/\bguarantee[ds]?\b|\bguaranteed\b|\bpromise\b|\branks? (#?1|first)\b|\btop of google\b/i.test(withoutUrls))
    problems.push("makes a promise or guarantee the facts sheet doesn't hold");
  if (/\b(is|are|it's|now)\s+(live|published)\b/i.test(withoutUrls)) problems.push("claims the private draft is live or published");
  return problems;
}

/** Reads the second-pass reviewer's JSON {pass, problems}; null when unusable (treated as a fail). */
export function parseReviewVerdict(raw: string): { pass: boolean; problems: string[] } | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { pass?: unknown; problems?: unknown };
    if (typeof parsed.pass !== "boolean") return null;
    const problems = Array.isArray(parsed.problems) ? parsed.problems.filter((item): item is string => typeof item === "string").map((p) => p.slice(0, 200)).slice(0, 8) : [];
    return { pass: parsed.pass && problems.length === 0, problems };
  } catch {
    return null;
  }
}

/** Reads the writer's JSON {body}; null when unusable. */
export function parseReplyDraft(raw: string): string | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as { body?: unknown };
    const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
    return body ? body.slice(0, MAX_REPLY_CHARS + 200) : null;
  } catch {
    return null;
  }
}

/** A real reply keeps "Re:" once (honest here: it is in the prospect's own thread). */
export function replySubject(subject: string | null | undefined): string {
  let out = (subject ?? "").replace(/\s+/g, " ").trim();
  while (/^(re|aw|sv)\s*:\s*/i.test(out)) out = out.replace(/^(re|aw|sv)\s*:\s*/i, "");
  return `Re: ${out || "Your free website draft"}`.slice(0, 160);
}

/** The short in-thread footer: sender, company, address when set, and the unsubscribe link. */
export function replyFooter(input: { senderName: string; unsubscribeUrl: string; address?: string | null | undefined }): string {
  const sender = input.senderName === "Revora Growth Systems" ? "Revora Growth Systems" : `${input.senderName}, Revora Growth Systems`;
  return ["", "--", sender, ...(input.address?.trim() ? [input.address.trim()] : []), `Unsubscribe: ${input.unsubscribeUrl}`].join("\n");
}

/** A plain draft the operator can edit when the AI is unavailable or the reply needs a human. */
export function fallbackDraft(intent: InboundIntent, facts: FactsSheet): string {
  if (intent === "price")
    return `Thanks for asking. ${facts.plan} is ${facts.setupPrice} and ${facts.monthlyPrice}. ${facts.firstMonth} ${facts.cancel}\n\nYou can claim the draft here: ${facts.claimUrl}`;
  if (intent === "positive" || intent === "question")
    return `Thanks for getting back to me. Your draft is here: ${facts.previewUrl}\n\nIf you'd like to keep it, you can claim it here: ${facts.claimUrl}`;
  return "";
}
