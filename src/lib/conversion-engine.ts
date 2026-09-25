/**
 * Revora conversion engine.
 *
 * Every website Revora builds is organised around ONE primary business goal.
 * This module turns that goal into an ordered ladder of conversion paths
 * (CALL → TEXT → BOOK → REQUEST QUOTE → CONTACT), the sections a page must carry
 * to support it, and the objections that have to be answered before a stranger
 * will act.
 *
 * Pure and browser-safe: it only reports what the workspace facts support, so a
 * path is never advertised when the underlying capability is missing.
 */

export type ConversionGoal = "call" | "text" | "book" | "quote" | "buy" | "lead";

export const CONVERSION_GOALS: { value: ConversionGoal; label: string; blurb: string }[] = [
  { value: "call", label: "Phone calls", blurb: "Best for urgent, high-ticket or emergency work." },
  {
    value: "text",
    label: "Text messages",
    blurb: "Best when customers want a quick answer without talking.",
  },
  {
    value: "book",
    label: "Online bookings",
    blurb: "Best for fixed-length, fixed-price appointments.",
  },
  { value: "quote", label: "Quote requests", blurb: "Best when price depends on the job." },
  {
    value: "buy",
    label: "Online purchases",
    blurb: "Best for packages you can charge for up front.",
  },
  {
    value: "lead",
    label: "Contact enquiries",
    blurb: "Best when the first step is a conversation.",
  },
];

const GOAL_ALIASES: Record<string, ConversionGoal> = {
  call: "call",
  calls: "call",
  phone: "call",
  ring: "call",
  text: "text",
  sms: "text",
  message: "text",
  book: "book",
  booking: "book",
  bookings: "book",
  appointment: "book",
  schedule: "book",
  quote: "quote",
  quotes: "quote",
  estimate: "quote",
  pricing: "quote",
  buy: "buy",
  purchase: "buy",
  checkout: "buy",
  pay: "buy",
  lead: "lead",
  contact: "lead",
  enquiry: "lead",
  inquiry: "lead",
  form: "lead",
};

/** Maps free text (a CTA label, brief answer or stored setting) to a goal. */
export function normalizeGoal(value: unknown, fallback: ConversionGoal = "quote"): ConversionGoal {
  if (typeof value !== "string") return fallback;
  const words = value.toLowerCase().match(/[a-z]+/g) ?? [];
  for (const word of words) {
    const hit = GOAL_ALIASES[word];
    if (hit) return hit;
  }
  return fallback;
}

export type ConversionContext = {
  phone: string | null;
  smsCapable: boolean;
  bookableCount: number;
  quoteFormCount: number;
  paymentsEnabled: boolean;
  email: string | null;
  slug: string | null;
};

export type CtaStep = {
  key: ConversionGoal;
  label: string;
  /** Path or protocol link a visitor can actually follow, when available. */
  href: string | null;
  available: boolean;
  /** Why this step is in the ladder, or what is missing. */
  note: string;
};

const digits = (value: string) => value.replace(/[^\d+]/g, "");

/** Builds the ordered conversion ladder for a goal: primary first, fallbacks after. */
export function ctaLadder(goal: ConversionGoal, ctx: ConversionContext): CtaStep[] {
  const site = ctx.slug ? `/s/${ctx.slug}` : null;
  const steps: Record<ConversionGoal, CtaStep> = {
    call: {
      key: "call",
      label: ctx.phone ? `Call ${ctx.phone}` : "Call us",
      href: ctx.phone ? `tel:${digits(ctx.phone)}` : null,
      available: !!ctx.phone,
      note: ctx.phone
        ? "Tap-to-call in the header, hero and sticky bar."
        : "Add a phone number to switch calling on.",
    },
    text: {
      key: "text",
      label: "Text us",
      href: ctx.phone && ctx.smsCapable ? `sms:${digits(ctx.phone)}` : null,
      available: !!ctx.phone && ctx.smsCapable,
      note:
        ctx.phone && ctx.smsCapable
          ? "One-tap text for visitors who don't want to talk."
          : "Mark your number as text-capable to offer this.",
    },
    book: {
      key: "book",
      label: "Book online",
      href: site && ctx.bookableCount > 0 ? `${site}/book` : null,
      available: ctx.bookableCount > 0,
      note:
        ctx.bookableCount > 0
          ? `${ctx.bookableCount} service${ctx.bookableCount === 1 ? "" : "s"} can be booked without a phone call.`
          : "Make at least one service bookable to offer self-serve booking.",
    },
    quote: {
      key: "quote",
      label: "Get my quote",
      href: site && ctx.quoteFormCount > 0 ? `${site}/pricing` : null,
      available: ctx.quoteFormCount > 0,
      note:
        ctx.quoteFormCount > 0
          ? "Instant quote calculator captures the lead even outside working hours."
          : "Turn on the quote calculator so after-hours visitors still convert.",
    },
    buy: {
      key: "buy",
      label: "Buy now",
      href: ctx.paymentsEnabled && site ? `${site}/pricing` : null,
      available: ctx.paymentsEnabled,
      note: ctx.paymentsEnabled
        ? "Card checkout for packaged work."
        : "Connect payments to sell packages online.",
    },
    lead: {
      key: "lead",
      label: "Send a message",
      href: site ? `${site}/contact` : null,
      available: !!site,
      note: ctx.email
        ? "Form submissions land in your CRM and email."
        : "Add an email so enquiries reach you.",
    },
  };

  /** Fallback order after the primary goal: fast paths first, slow paths last. */
  const order: ConversionGoal[] = ["call", "text", "book", "quote", "buy", "lead"];
  const rest = order.filter((key) => key !== goal);
  return [steps[goal], ...rest.map((key) => steps[key])];
}

export const OBJECTIONS: { key: string; question: string; why: string }[] = [
  {
    key: "price",
    question: "What does it cost?",
    why: "Price uncertainty is the most common reason visitors leave.",
  },
  {
    key: "speed",
    question: "How soon can you come out?",
    why: "Availability decides who gets the job.",
  },
  {
    key: "area",
    question: "Do you cover my area?",
    why: "Visitors bounce when coverage is unclear.",
  },
  {
    key: "trust",
    question: "Are you insured and experienced?",
    why: "Strangers need proof before letting you in.",
  },
  {
    key: "process",
    question: "What happens after I enquire?",
    why: "Removing the unknown lifts form completion.",
  },
  {
    key: "guarantee",
    question: "What if I'm not happy?",
    why: "A clear promise reduces perceived risk.",
  },
];

export type ConversionGap = {
  key: string;
  title: string;
  detail: string;
  action: string;
  severity: "critical" | "warning" | "opportunity";
};

/**
 * Reports what is blocking the chosen goal. `sectionKinds` is the set of
 * visible section kinds across the site, `faqQuestions` the FAQ copy in place.
 */
export function conversionGaps(
  goal: ConversionGoal,
  ctx: ConversionContext,
  sectionKinds: string[],
  faqQuestions: string[],
): ConversionGap[] {
  const gaps: ConversionGap[] = [];
  const ladder = ctaLadder(goal, ctx);
  const primary = ladder[0]!;

  if (!primary.available) {
    gaps.push({
      key: `primary-${primary.key}`,
      title: `Your primary action can't be completed`,
      detail: `The site is built around ${primary.label.toLowerCase()}, but that path isn't wired up yet.`,
      action: primary.note,
      severity: "critical",
    });
  }

  const backups = ladder.slice(1).filter((step) => step.available);
  if (backups.length < 2) {
    gaps.push({
      key: "backup-paths",
      title: "Only one way to convert",
      detail: `${backups.length} backup path${backups.length === 1 ? "" : "s"} available besides your main action.`,
      action:
        "Offer at least two more paths — some visitors will call, others will only ever use a form.",
      severity: "warning",
    });
  }

  const asked = faqQuestions.join(" ").toLowerCase();
  const unanswered = OBJECTIONS.filter((objection) => {
    const probe = objection.key === "area" ? ["area", "cover", "travel"] : [objection.key];
    return !probe.some((word) => asked.includes(word));
  });
  if (unanswered.length) {
    gaps.push({
      key: "objections",
      title: "Unanswered objections",
      detail: `${unanswered.length} of ${OBJECTIONS.length} common objections are not answered: ${unanswered
        .map((o) => o.question)
        .join(" ")}`,
      action: "Answer each one in the FAQ — Revora can draft them from your services and area.",
      severity: unanswered.length > 3 ? "warning" : "opportunity",
    });
  }

  return gaps;
}
