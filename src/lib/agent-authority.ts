/**
 * The 4-tier authority matrix for outside bots (Grok and its specialist bots).
 * Browser-safe: no secrets, no database.
 *
 * Levels 1-3 are things a bot may do on its own from its own workstation or
 * through the read/ingest gateway routes. Level 4 is never done by a bot until
 * the founder approves the exact request in the Approvals screen; the gateway
 * only records and reports that decision, it never carries the action out.
 */

export type AuthorityLevel = 1 | 2 | 3 | 4;

export const AUTHORITY_TIERS: readonly { level: AuthorityLevel; name: string; authority: string; operations: readonly string[] }[] = [
  {
    level: 1,
    name: "Read",
    authority: "Automated",
    operations: ["Inspect code", "Read health and build status", "Read CI output", "Read lead review counts", "Read permitted analytics"],
  },
  {
    level: 2,
    name: "Prepare",
    authority: "Automated",
    operations: ["Draft code fixes", "Draft private demo specifications", "Draft outreach text", "Write reports", "Draft pull requests"],
  },
  {
    level: 3,
    name: "Execute (safe)",
    authority: "Automated",
    operations: ["Run local test suites", "Repair isolated git branches", "Open pull requests", "Send leads to the owner review list"],
  },
  {
    level: 4,
    name: "Approval required",
    authority: "Founder sign-off",
    operations: ["Publish live sites", "Deploy to production", "Merge into lovable-sync", "Send cold email or SMS", "Change Stripe billing", "Delete customer data", "Start paid AI builds"],
  },
];

/**
 * Every Level 4 action a bot may ask for. Anything not on this list cannot be
 * requested through the gateway at all.
 */
export const LEVEL4_ACTIONS = {
  merge_pull_request: "Merge a pull request into lovable-sync",
  deploy_production: "Publish the platform in Lovable (production deploy)",
  publish_site: "Publish a customer website",
  send_outreach: "Send a batch of cold email or SMS",
  start_paid_build: "Start a paid AI website build",
  change_billing: "Change Stripe billing or prices",
  delete_customer_data: "Delete customer data",
  retry_failed_job: "Retry a failed paid background job",
} as const;

export type Level4Action = keyof typeof LEVEL4_ACTIONS;
export const LEVEL4_ACTION_KINDS = Object.keys(LEVEL4_ACTIONS) as Level4Action[];

/** Actions whose approval never lets the bot touch money or the canonical offer. */
export const OFFER_LOCKED_NOTE =
  "The offer is fixed: $350 setup, first month free, then $100/month, with a 3-day full-access trial. A billing request may never change it.";

/** Requests that can't be undone need a second tap on the Approvals screen. */
const TWO_TAP = new Set<string>(["delete_customer_data", "change_billing", "send_outreach", "deploy_production"]);
export const needsSecondTap = (kind: string) => TWO_TAP.has(kind);

export function isLevel4Action(kind: unknown): kind is Level4Action {
  return typeof kind === "string" && (LEVEL4_ACTION_KINDS as string[]).includes(kind);
}

/** The level of a gateway operation, so the routes and the runbook agree. */
export const GATEWAY_LEVELS = {
  "GET /api/public/agent/health": 1,
  "GET /api/public/agent/builds": 1,
  "GET /api/public/agent/builds/:id": 1,
  "GET /api/public/agent/analytics": 1,
  "GET /api/public/agent/briefing": 1,
  "GET /api/public/agent/action-requests/:id": 1,
  "POST /api/public/agent/prospects": 3,
  "POST /api/public/agent/action-requests": 3,
  "POST /api/public/agent/action-requests/:id/complete": 3,
} as const satisfies Record<string, AuthorityLevel>;
