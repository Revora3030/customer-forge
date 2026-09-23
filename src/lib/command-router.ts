/**
 * REVORA COMMAND ROUTER — one natural-language entry point for the whole
 * platform.
 *
 * The owner types what they want in normal words. This module works out which
 * subsystem actually owns that work and returns a concrete destination: the
 * website assistant, the generator, Pre-Flight, self-healing, the domain panel,
 * billing, leads, quotes, booking, automations, analytics or media.
 *
 * It never claims to have done the work. It returns where the work happens and,
 * for assistant work, the instruction to hand over. Nothing is ever rejected for
 * not matching a known command: anything a rule doesn't claim is translated into
 * builder work by the intent translator and handed to the assistant.
 */


export type CommandTarget =
  | "assistant"
  | "generate"
  | "preflight"
  | "self_heal"
  | "design"
  | "seo"
  | "domain"
  | "billing"
  | "leads"
  | "quotes"
  | "booking"
  | "automations"
  | "analytics"
  | "media"
  | "publish"
  | "team"
  | "support";

export type RoutedCommand = {
  target: CommandTarget;
  /** What Revora is about to do, in the owner's words. */
  action: string;
  /** In-app destination for this subsystem, or null when it's handled inline. */
  route: string | null;
  /** Element id to scroll to inside the builder, when relevant. */
  anchor: string | null;
  /** Instruction to hand to the website assistant, when target is assistant. */
  instruction: string | null;
  confident: boolean;
};

type Rule = {
  target: CommandTarget;
  patterns: RegExp[];
  action: string;
  route: string | null;
  anchor?: string;
  /** Some targets need the raw request passed through to the assistant. */
  passThrough?: boolean;
};

const RULES: Rule[] = [
  {
    target: "generate",
    patterns: [
      /\bbuild (me |my |the )?(a )?(new )?(website|site)\b/i,
      /\b(create|make|generate) (me |my )?(a )?(new )?(website|site)\b/i,
      /\bstart (my|the) (website|site)\b/i,
      /\brebuild (my|the) (website|site)\b/i,
      /\bcompletely different (website|site|design)\b/i,
    ],
    action: "Build your website from what you've told Revora",
    route: "/app/website",
    anchor: "site-engine",
  },
  {
    target: "self_heal",
    patterns: [
      /\bfix (everything|anything|what you can|all of it)\b/i,
      /\bfix (my|the) (website|site|problems|issues)\b/i,
      /\brepair\b/i,
      /\bfix it\b/i,
    ],
    action: "Fix everything Revora can safely fix",
    route: "/app/website",
    anchor: "preflight",
  },
  {
    target: "preflight",
    patterns: [
      /\b(what'?s|whats) wrong\b/i,
      /\b(check|test|audit|scan) (my|the)? ?(website|site|everything)?\b/i,
      /\bis (my|the) (site|website) (ready|ok|okay|broken)\b/i,
      /\bpre-?flight\b/i,
      /\bbroken\b/i,
    ],
    action: "Run Pre-Flight on your live pages",
    route: "/app/website",
    anchor: "preflight",
  },
  {
    target: "publish",
    patterns: [/\b(publish|go live|launch)\b/i, /\bmake it live\b/i],
    action: "Take your website live once Pre-Flight passes",
    route: "/app/website",
    anchor: "preflight",
  },
  {
    target: "domain",
    patterns: [
      /\bdomain\b/i,
      /\bdns\b/i,
      /\bssl\b/i,
      /\bhttps\b/i,
      /\bnameserver/i,
      /\bconnect .*\.(com|net|co|org|site)\b/i,
    ],
    action: "Set up your own domain with DNS and HTTPS checks",
    route: "/app/domain",
  },
  {
    target: "billing",
    patterns: [
      /\b(billing|invoice|payment|card|subscription|charge|refund|price of revora|my plan)\b/i,
    ],
    action: "Open billing — setup fee, subscription and invoices",
    route: "/app/billing",
  },
  {
    target: "leads",
    patterns: [/\b(lead|leads|enquir|inquir|crm|contact requests)\b/i],
    action: "Open your leads and follow-up pipeline",
    route: "/app/leads",
  },
  {
    target: "quotes",
    patterns: [
      /\bquote (calculator|form|builder)\b/i,
      /\badd (a )?quote\b/i,
      /\bquotes?\b/i,
      /\bestimat/i,
    ],
    action: "Set up the quote calculator visitors use",
    route: "/app/quotes",
  },
  {
    target: "booking",
    patterns: [/\bbook(ing|ings)?\b/i, /\bcalendar\b/i, /\bappointment/i, /\bavailability\b/i],
    action: "Set up booking and availability",
    route: "/app/calendar",
  },
  {
    target: "automations",
    patterns: [/\b(automation|follow[- ]?up|reminder|review request|drip|sequence)\b/i],
    action: "Set up automatic follow-ups and reminders",
    route: "/app/automations",
  },
  {
    target: "analytics",
    patterns: [
      /\b(analytics|traffic|visitors|conversion rate|report|stats)\b/i,
      /\bqr code/i,
      /\bcampaign/i,
    ],
    action: "Open analytics, traffic and campaign tracking",
    route: "/app/analytics",
  },
  {
    target: "media",
    patterns: [/\b(photo|photos|image|images|logo|gallery|picture)\b/i],
    action: "Manage the photos and images on your site",
    route: "/app/website",
    anchor: "media-library",
  },
  {
    target: "team",
    patterns: [/\b(team|invite|staff|member|permission)\b/i],
    action: "Invite people and manage their access",
    route: "/app/settings",
  },
  {
    target: "seo",
    patterns: [
      /\bseo\b/i,
      /\bgoogle\b/i,
      /\brank(ing)?\b/i,
      /\bsearch results?\b/i,
      /\bkeyword/i,
      /\bsitemap\b/i,
      /\bschema\b/i,
    ],
    action: "Improve how your site shows up in search",
    route: "/app/website",
    anchor: "website-assistant",
    passThrough: true,
  },
  {
    target: "design",
    patterns: [
      /\b(colour|color|font|theme|look|style|design|premium|modern|luxur|brand)\b/i,
      /\bmake (it|this|my site) (more )?(premium|professional|modern|different)\b/i,
    ],
    action: "Change how your website looks",
    route: "/app/website",
    anchor: "website-assistant",
    passThrough: true,
  },
];

const ASSISTANT_HINTS = [
  /\badd\b/i,
  /\bchange\b/i,
  /\bwrite\b/i,
  /\bshorter\b/i,
  /\blonger\b/i,
  /\bpage\b/i,
  /\bsection\b/i,
  /\bhomepage\b/i,
  /\bservice\b/i,
  /\bconvert\b/i,
  /\bmobile\b/i,
  /\bbetter\b/i,
];

/**
 * Routes one natural-language request. Pure: the same words always route to the
 * same subsystem, so this is testable and predictable for support.
 */
export function routeCommand(input: string): RoutedCommand {
  const text = String(input ?? "").trim();
  if (!text) {
    return {
      target: "assistant",
      action: "Tell Revora what you want in your own words — it'll handle the rest",
      route: null,
      anchor: "website-assistant",
      instruction: null,
      confident: false,
    };
  }

  for (const rule of RULES) {
    if (!rule.patterns.some((pattern) => pattern.test(text))) continue;
    return {
      target: rule.target,
      action: rule.action,
      route: rule.route,
      anchor: rule.anchor ?? null,
      instruction: rule.passThrough || rule.target === "assistant" ? text : null,
      confident: true,
    };
  }

  // No rule matched, and that is not a rejection: the intent translator turns
  // any wording into builder work, so this always goes to the assistant.
  return {
    target: "assistant",
    action: text.trim(),
    route: null,
    anchor: "website-assistant",
    instruction: text,
    confident: true,
  };
}

/** Suggestions shown under the command box. Real capabilities only. */
export const COMMAND_EXAMPLES = [
  "Build my website",
  "Fix anything that's broken",
  "Show me what's wrong",
  "Make my homepage convert better",
  "Add a page for gutter cleaning",
  "Improve my SEO",
  "Connect my domain",
  "Add booking",
  "Add a quote calculator",
  "Make this more premium",
] as const;
