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
