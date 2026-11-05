import { BUSINESS } from "@/lib/business-identity";
import { GROWTH_SYSTEM, REFUND_POLICY } from "@/lib/offer";

/**
 * Owner help center (LOV-8). Every sentence here was checked against the app
 * (the file is named next to each article in `verifiedBy`). Prices and the
 * trial length come from offer.ts, never typed in. If a feature changes,
 * update or remove the article; do not add claims that are not in the app.
 */
export type HelpArticle = {
  slug: string;
  title: string;
  description: string;
  /** Search snippet (~120-155 chars). Only facts already stated in `steps`. */
  metaDescription: string;
  updated: string;
  steps: string[];
  verifiedBy: string[];
};

const setup = `$${GROWTH_SYSTEM.setupPrice}`;
const monthly = `$${GROWTH_SYSTEM.monthlyPrice}`;
const trial = GROWTH_SYSTEM.fullAccessWindow;
const UPDATED = "2026-11-04";

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "free-trial",
    title: `What the ${GROWTH_SYSTEM.fullAccessWindowAdjective} free trial means`,
    description: `You get ${trial} of full access when you sign up, with no card needed.`,
    metaDescription: `Revora's free trial gives you ${trial} of full access when you sign up. No card is needed, nothing is charged, and the ${setup} setup is due only at launch.`,
    updated: UPDATED,
    steps: [
      `When you sign up you get ${trial} of full access for free.`,
      "No card is needed for the trial, and nothing is charged during it.",
      `The ${setup} setup is charged only when you choose to launch, at checkout.`,
    ],
    verifiedBy: ["src/lib/offer.ts (FULL_ACCESS_TRIAL_DAYS, launch copy)"],
  },
  {
    slug: "billing",
    title: "How billing works",
    description: `${setup} setup at launch, first month free, then ${monthly}/month.`,
    metaDescription: `How Revora billing works: a one-time ${setup} setup fee at launch, your first month free, then ${monthly}/month, month to month. Cancel anytime.`,
    updated: UPDATED,
    steps: [
      `At launch you pay a one-time ${setup} setup fee.`,
      `Your first month of the ${monthly}/month platform fee is free. Your first monthly payment is charged 30 days after setup.`,
      `After that it is ${monthly}/month, month to month. Cancel anytime.`,
      REFUND_POLICY,
      "To change your card, open Billing in your dashboard and choose \"Update payment method\".",
      "If you cancel, Billing shows the date until which you keep full access.",
    ],
    verifiedBy: ["src/lib/offer.ts (GROWTH_SYSTEM, REFUND_POLICY)", "src/routes/_authenticated/app.billing.tsx"],
  },
  {
    slug: "add-a-page",
    title: "Add a page to your site",
    description: "Add, name and order the pages of your website.",
    metaDescription: "Add a page to your Revora site: open Website in your dashboard, choose Add a page, type a name, pick the kind of page and save. Rename pages there too.",
    updated: UPDATED,
    steps: [
      "Open Website in your dashboard.",
      "Find \"Manage every page on your site\" and choose \"Add a page\".",
      "Type a page name, pick the kind of page, and save.",
      "You can rename existing pages from the same list.",
    ],
    verifiedBy: ["src/components/app/PageManager.tsx", "src/routes/_authenticated/app.website.tsx"],
  },
  {
    slug: "connect-a-domain",
    title: "Connect a domain",
    description: "Use a web address you already own, or register a new one.",
    metaDescription: "Connect a domain you already own to your Revora site by adding the records shown in your dashboard at your registrar, or register a new domain name.",
    updated: UPDATED,
    steps: [
      "Open Domain in your dashboard.",
      "Already own a domain? Use \"Use a domain you already own\" and enter it.",
      "The page then shows the records to add at your registrar (the company you bought the domain from). Add them there exactly as shown.",
      "Don't have one yet? Use \"Register your own domain name\" on the same page.",
    ],
    verifiedBy: ["src/components/app/DomainCenter.tsx", "src/routes/_authenticated/app.domain.tsx"],
  },
  {
    slug: "read-leads",
    title: "Read your leads",
    description: "Where the people who contact you through your site show up.",
    metaDescription: "See everyone who contacted you through your Revora site in Leads, and turn on Booking & lead email alerts in Settings to get an email for each new lead.",
    updated: UPDATED,
    steps: [
      "Open Leads in your dashboard to see the people who contacted you.",
      "Turn on \"Booking & lead email alerts\" in Settings to also get an email for each new lead and booking.",
    ],
    verifiedBy: ["src/routes/_authenticated/app.leads.tsx", "src/components/app/LeadNotifications.tsx"],
  },
  {
    slug: "try-your-lead-alerts",
    title: "Send a test lead",
    description: "See what a real lead looks like before one arrives.",
    metaDescription: "Send a test lead from your Revora dashboard: one clearly labelled sample lead lands in Leads, and an alert is emailed to you if lead alerts are on.",
    updated: UPDATED,
    steps: [
      "On your dashboard home, while you are getting set up, choose \"Send a test lead\".",
      "One clearly labelled sample lead is added to your Leads page.",
      "If you set up lead email alerts, an alert is also emailed to you, so you can check that alerts reach you.",
    ],
    verifiedBy: ["src/components/app/SendTestLeadCard.tsx", "src/lib/test-lead.functions.ts"],
  },
  {
    slug: "booking-link",
    title: "Add your booking link",
    description: "Link the booking tool you already use so customers can book online.",
    metaDescription: "Add the booking page you already use to your Revora site: open Settings, paste the https:// link under My booking link and save. Clear it to remove it.",
    updated: UPDATED,
    steps: [
      "Open Settings and find \"My booking link\".",
      "Paste the link to the booking page you already use. It must start with https://.",
      "Save. To remove it, clear the field and save again.",
    ],
    verifiedBy: ["src/components/app/BookingLinkCard.tsx", "src/routes/_authenticated/app.settings.tsx"],
  },
  {
    slug: "contact-support",
    title: "Contact support",
    description: `Email ${BUSINESS.email} for help.`,
    metaDescription: `Get help with your Revora site: email ${BUSINESS.email} with your business name, your site address and what is wrong. A screenshot helps.`,
    updated: UPDATED,
    steps: [
      `Email ${BUSINESS.email}.`,
      "Include your business name, your site address and what is wrong. A screenshot helps.",
    ],
    verifiedBy: ["src/lib/brand.ts (email)"],
  },
];

export function findHelpArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find(a => a.slug === slug);
}

/** The plain-markdown twin served at /help/<slug>.md. */
export function helpArticleMarkdown(a: HelpArticle): string {
  return [`# ${a.title}`, "", `> ${a.description}`, "", ...a.steps.map((s, i) => `${i + 1}. ${s}`), "", `Updated: ${a.updated}`, ""].join("\n");
}

export function helpIndexMarkdown(): string {
  return ["# Revora help center", "", ...HELP_ARTICLES.map(a => `- [${a.title}](/help/${a.slug}.md): ${a.description}`), ""].join("\n");
}

/** Path owners open in the app (and that Jarvis should cite). */
export function helpArticlePath(slug: string): string {
  return `/help/${slug}`;
}

export type HelpArticleCitation = {
  slug: string;
  title: string;
  description: string;
  path: string;
  markdownPath: string;
};

export function helpArticleCitation(a: HelpArticle): HelpArticleCitation {
  return {
    slug: a.slug,
    title: a.title,
    description: a.description,
    path: helpArticlePath(a.slug),
    markdownPath: `/help/${a.slug}.md`,
  };
}

/**
 * Rank owner help articles for a short question. Pure string match on
 * title/description/steps/slug — no network, no invented answers. Empty query
 * returns the full index (capped).
 */
export function matchHelpArticles(query: string, limit = 5): HelpArticleCitation[] {
  const q = query.trim().toLowerCase().slice(0, 120);
  const capped = Math.max(1, Math.min(limit, 20));
  if (!q) return HELP_ARTICLES.slice(0, capped).map(helpArticleCitation);
  // Tokens of 3+ chars; match as whole words so "not" inside "nothing" does not hit.
  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  if (tokens.length === 0) return [];
  const scored = HELP_ARTICLES.map((a) => {
    const hay = `${a.slug} ${a.title} ${a.description} ${a.steps.join(" ")}`.toLowerCase();
    let score = 0;
    if (hay.includes(q)) score += 10;
    for (const t of tokens) {
      const re = new RegExp(`(?:^|[^a-z0-9])${t}(?:[^a-z0-9]|$)`);
      if (re.test(hay)) score += 1;
    }
    return { a, score };
  }).filter((x) => x.score > 0);
  scored.sort((x, y) => y.score - x.score || x.a.slug.localeCompare(y.a.slug));
  return scored.slice(0, capped).map((x) => helpArticleCitation(x.a));
}
