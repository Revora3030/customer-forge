/**
 * Claim-to-feature registry.
 *
 * Every capability Revora advertises to a client is listed here together with
 * the module that implements it and the test that proves it. `claim-registry.test.ts`
 * fails the build if a claimed capability has no implementation or no test, so a
 * marketing promise can never drift ahead of the product.
 *
 * `live` answers a different question: whether the capability is switched on for
 * *this* workspace right now. A claim can be implemented but not yet live.
 */

export type ClaimKey =
  | "website"
  | "booking"
  | "quotes"
  | "crm"
  | "followup"
  | "analytics"
  | "seo"
  | "reviews"
  | "domains"
  | "billing"
  | "preflight";

export type Claim = {
  key: ClaimKey;
  /** What the client is promised, in their words. */
  promise: string;
  /** Module that implements it. */
  module: string;
  /** Test that proves it. */
  test: string;
  /** Where the client uses it. */
  to: string;
};

export const CLAIMS: Claim[] = [
  {
    key: "website",
    promise: "Revora builds your website from a description of your business.",
    module: "src/lib/site-materialize.server.ts",
    test: "src/lib/site-materialize.test.ts",
    to: "/app/website",
  },
  {
    key: "booking",
    promise: "Customers book you online.",
    module: "src/lib/website-content.ts",
    test: "src/lib/flows.e2e.test.ts",
    to: "/app/calendar",
  },
  {
    key: "quotes",
    promise: "Customers get an instant price.",
    module: "src/routes/_authenticated/app.quotes.tsx",
    test: "src/lib/flows.e2e.test.ts",
    to: "/app/quotes",
  },
  {
    key: "crm",
    promise: "Every enquiry lands in your CRM.",
    module: "src/lib/launch-qa.ts",
    test: "src/lib/interaction-health.test.ts",
    to: "/app/leads",
  },
  {
    key: "followup",
    promise: "New enquiries get followed up automatically.",
    module: "src/lib/automation-engine.ts",
    test: "src/lib/flows.e2e.test.ts",
    to: "/app/automations",
  },
  {
    key: "analytics",
    promise: "You see where your customers come from.",
    module: "src/lib/traffic.ts",
    test: "src/lib/monthly-report.test.ts",
    to: "/app/analytics",
  },
  {
    key: "seo",
    promise: "Your pages are set up to be found on Google.",
    module: "src/lib/site-seo.ts",
    test: "src/lib/preflight.test.ts",
    to: "/app/website",
  },
  {
    key: "reviews",
    promise: "Revora collects and shows customer reviews.",
    module: "src/lib/growth-hooks.ts",
    test: "src/lib/growth-command.test.ts",
    to: "/app/reviews",
  },
  {
    key: "domains",
    promise: "Connect the domain you own, with HTTPS.",
    module: "src/lib/revora-address.ts",
    test: "src/lib/client-address.test.ts",
    to: "/app/domain",
  },
  {
    key: "billing",
    promise: "Card payments, one setup fee and a monthly plan.",
    module: "src/lib/stripe.functions.ts",
    test: "src/lib/stripe-webhook.test.ts",
    to: "/app/billing",
  },
  {
    key: "preflight",
    promise: "Revora tests your site before it goes live.",
    module: "src/lib/preflight.ts",
    test: "src/lib/preflight.test.ts",
    to: "/app/website",
  },
];

export type ClaimState = {
  claim: Claim;
  /** Switched on and working for this workspace. */
  live: boolean;
  /** Plain-language state. */
  detail: string;
};

export type ClaimFacts = {
  pagesCount: number;
  bookableCount: number;
  quoteFormCount: number;
  leadsCount: number;
  followUpAutomations: number;
  analyticsConfigured: boolean;
  seoConfigured: boolean;
  reviewRequests: number;
  publicHost: string | null;
  setupPaid: boolean;
};

/** Real, per-workspace status for every claim — never an optimistic default. */
export function claimStates(facts: ClaimFacts): ClaimState[] {
  const state = (key: ClaimKey, live: boolean, on: string, off: string): ClaimState => {
    const claim = CLAIMS.find((c) => c.key === key)!;
    return { claim, live, detail: live ? on : off };
  };

  return [
    state(
      "website",
      facts.pagesCount > 0,
      `${facts.pagesCount} pages built.`,
      "No pages built yet.",
    ),
    state(
      "booking",
      facts.bookableCount > 0,
      `${facts.bookableCount} services bookable online.`,
      "Online booking is off.",
    ),
    state(
      "quotes",
      facts.quoteFormCount > 0,
      "Instant quotes are live.",
      "No quote calculator yet.",
    ),
    state(
      "crm",
      facts.leadsCount > 0,
      `${facts.leadsCount} enquiries in your CRM.`,
      "Ready — waiting for your first enquiry.",
    ),
    state(
      "followup",
      facts.followUpAutomations > 0,
      `${facts.followUpAutomations} automations running.`,
      "Automatic follow-up is off.",
    ),
    state("analytics", facts.analyticsConfigured, "Tracking is on.", "Tracking is off."),
    state("seo", facts.seoConfigured, "Search settings are complete.", "Search settings missing."),
    state(
      "reviews",
      facts.reviewRequests > 0,
      `${facts.reviewRequests} review requests sent.`,
      "No review requests sent yet.",
    ),
    state(
      "domains",
      Boolean(facts.publicHost),
      `Live on ${facts.publicHost}.`,
      "No web address connected yet.",
    ),
    state("billing", facts.setupPaid, "Setup paid, plan active.", "Setup payment outstanding."),
    state("preflight", true, "Pre-Flight runs before every publish.", ""),
  ];
}
