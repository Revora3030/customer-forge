/**
 * PAI-15: which chat messages are business work for an agent run, not website
 * edits. Deliberately conservative: anything that mentions the website itself,
 * or that is not clearly an operations request, stays on the existing site path.
 * Pure text rules, no AI call, so a wrong guess can only keep today's behaviour.
 */
export type ChatRoute = "agent_run" | "site";

/** Words that mean the owner is talking about the website, so the site planner keeps it. */
const SITE_WORDS =
  /\b(web ?site|web ?page|site|page|pages|section|hero|headline|heading|banner|footer|header|nav(bar)?|button|colou?rs?|fonts?|photos?|images?|logo|layout|design|homepage|home page|copy|wording|faq|gallery|theme|publish|template|widget|popup|form)\b/;

/** Clear operations requests: customer follow-up, review requests, replies, money owed. */
const OPERATIONS: RegExp[] = [
  /\b(send|text|email|message|remind|chase|nudge)\b.{0,40}\b(customers?|clients?|leads?|prospects?|reviewers?|patients?)\b/,
  /\b(send|ask for|request|collect)\b.{0,30}\b(reviews?|testimonials?)\b/,
  /\bfollow[- ]?up\b.{0,30}\b(leads?|customers?|clients?|prospects?|quotes?|enquir(y|ies)|inquir(y|ies))\b/,
  /\bwho\b.{0,20}\b(hasn'?t|has not|haven'?t|have not|didn'?t|did not)\b.{0,20}\b(replied|responded|paid|booked|answered)\b/,
  /\b(unpaid|overdue|outstanding)\b.{0,20}\b(invoices?|quotes?|payments?)\b/,
  /\b(reply|respond)\b.{0,20}\b(to )?(my )?(unanswered )?(reviews?|leads?|enquir(y|ies)|inquir(y|ies))\b/,
  /\b(summari[sz]e|review|check)\b.{0,20}\b(my )?(new )?(leads?|reviews?|inbox|bookings?|quotes?)\b/,
];

export function routeChatMessage(
  instruction: string,
  opts: { hasAttachments?: boolean } = {},
): ChatRoute {
  if (opts.hasAttachments) return "site";
  const text = instruction.trim().toLowerCase();
  if (!text || text.length > 1500) return "site";
  if (SITE_WORDS.test(text)) return "site";
  return OPERATIONS.some((rule) => rule.test(text)) ? "agent_run" : "site";
}

/** What the owner is told when a message becomes a run. States only what happened. */
export const AGENT_RUN_STARTED_REPLY =
  "I've started this as a background task. You can follow each step below. Anything that would contact a customer waits for your approval first, and your website isn't touched.";

export const AGENT_RUN_NOT_STARTED_REPLY =
  "I couldn't start that just now, so nothing was done and nothing was sent. Please try again shortly.";
