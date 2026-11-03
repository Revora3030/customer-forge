import { GROWTH_SYSTEM } from "@/lib/offer";

/**
 * "What Revora replaces": the kinds of separate tools a local business often
 * pays for, matched to the Revora feature that does the same job.
 *
 * Rules this list keeps (and `what-revora-replaces.test.ts` enforces):
 * - Every row maps to a feature the offer already advertises (`offerFeature` must
 *   be an exact entry of `GROWTH_SYSTEM`), so /pricing and this section never disagree.
 * - Every row names the files that implement and prove it (`evidence`), and the
 *   test fails if one is missing, so a row cannot outlive its feature.
 * - Tool categories only. No brand names, no ratings, no counts and no dollar
 *   figures of any tool's price: the only dollar amounts are Revora's own,
 *   taken from the offer module.
 * - Email only for follow-up. Text messages need a provider switched on per
 *   deployment, so they are not promised here.
 */
export type ReplacedTool = {
  id: string;
  /** The kind of separate tool a business would otherwise pay for. */
  category: string;
  /** What Revora does instead, in plain words. */
  revora: string;
  /** The exact `GROWTH_SYSTEM` entry this row relies on. */
  offerFeature: string;
  /** Where the owner uses it. */
  appPath: string;
  /** Files that implement it, and a test that covers it. */
  evidence: readonly string[];
};

export const REPLACED_TOOLS: readonly ReplacedTool[] = [
  {
    id: "website",
    category: "Website builder and hosting",
    revora: "Your site is built from a description of your business, hosted for you and kept updated.",
    offerFeature: "Professional business website",
    appPath: "/app/website",
    evidence: [
      "src/lib/site-materialize.server.ts",
      "src/lib/site-materialize.test.ts",
      "src/routes/_authenticated/app.website.tsx",
      "src/lib/site-hosting.server.ts",
    ],
  },
  {
    id: "domain",
    category: "Domain connection and setup",
    revora: "Connect the domain you own, with HTTPS. Buying the name itself stays with your registrar.",
    offerFeature: "Custom domain connection/setup",
    appPath: "/app/domain",
    evidence: [
      "src/routes/_authenticated/app.domain.tsx",
      "src/lib/domain-ops.server.ts",
      "src/lib/client-address.test.ts",
    ],
  },
  {
    id: "forms",
    category: "Contact and enquiry forms",
    revora: "A form on your site sends every enquiry straight into your lead list.",
    offerFeature: "Lead capture system",
    appPath: "/app/leads",
    evidence: ["src/components/site/SiteForms.tsx", "src/lib/public-site.functions.ts"],
  },
  {
    id: "quotes",
    category: "Quote and estimate software",
    revora: "Visitors get an instant estimate from your own pricing rules, and the request lands with you.",
    offerFeature: "Quote/request system",
    appPath: "/app/quotes",
    evidence: [
      "src/routes/_authenticated/app.quotes.tsx",
      "src/components/site/SiteForms.tsx",
      "src/lib/flows.e2e.test.ts",
    ],
  },
  {
    id: "booking",
    category: "Online scheduling",
    revora: "Customers pick a service and a time on your site. Bookings show on your calendar.",
    offerFeature: "Online booking",
    appPath: "/app/calendar",
    evidence: [
      "src/components/site/SiteForms.tsx",
      "src/routes/_authenticated/app.calendar.tsx",
      "src/lib/booking-ics.ts",
    ],
  },
  {
    id: "crm",
    category: "Lead tracking / CRM",
    revora: "Every lead sits in one pipeline with its stage, what they said and your follow-up tasks.",
    offerFeature: "CRM",
    appPath: "/app/leads",
    evidence: [
      "src/routes/_authenticated/app.leads.tsx",
      "src/lib/launch-qa.ts",
      "src/lib/interaction-health.test.ts",
    ],
  },
  {
    id: "followup",
    category: "Email follow-up and automation",
    revora: "Ready-made email sequences go out on their own after an enquiry, a booking or a finished job.",
    offerFeature: "Automated lead follow-up",
    appPath: "/app/automations",
    evidence: [
      "src/routes/_authenticated/app.automations.tsx",
      "src/lib/automation-engine.ts",
      "src/lib/automation-queue.server.ts",
    ],
  },
  {
    id: "alerts",
    category: "Lead alerts and confirmations",
    revora: "You get an email when a lead arrives, and the customer gets a confirmation.",
    offerFeature: "Customer notifications",
    appPath: "/app/settings",
    evidence: [
      "src/lib/email-templates/lead-alert.tsx",
      "src/lib/email-templates/lead-confirmation.tsx",
      "src/lib/lead-alert-recipient.ts",
      "src/lib/messaging.lead-alert.test.ts",
    ],
  },
  {
    id: "reviews",
    category: "Review request tools",
    revora: "Ask the customer of a completed job for a review, and show the ones you approve on your site.",
    offerFeature: "Review/reputation automation",
    appPath: "/app/reviews",
    evidence: [
      "src/routes/_authenticated/app.reviews.tsx",
      "src/lib/growth-hooks.ts",
      "src/lib/growth-command.test.ts",
    ],
  },
  {
    id: "seo",
    category: "Local SEO basics",
    revora: "Page titles, descriptions, local business data and a sitemap are set up for you.",
    offerFeature: "Local SEO foundation",
    appPath: "/app/website",
    evidence: [
      "src/lib/site-seo.ts",
      "src/lib/site-head.ts",
      "src/routes/s.$slug.sitemap[.]xml.ts",
      "src/lib/preflight.test.ts",
    ],
  },
  {
    id: "analytics",
    category: "Website analytics and reporting",
    revora: "See visits, where they came from, what they clicked and the leads that followed.",
    offerFeature: "Analytics and reporting",
    appPath: "/app/analytics",
    evidence: [
      "src/routes/_authenticated/app.analytics.tsx",
      "src/lib/traffic.ts",
      "src/lib/monthly-report.test.ts",
    ],
  },
] as const;

export const REPLACES_HEADING = "What Revora replaces";

/** Every offer entry a row may point at. */
export const OFFER_FEATURES: readonly string[] = [
  ...GROWTH_SYSTEM.includes,
  ...GROWTH_SYSTEM.setupIncludes,
  ...GROWTH_SYSTEM.monthlyIncludes,
];
