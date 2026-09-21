/**
 * LIVE INTEGRATION CREDENTIAL CONTRACT
 * ====================================
 *
 * The live email / CRM / payment tests can only prove something when real
 * server-side test credentials exist. This module decides, from the environment
 * ALONE, which live suites may run — and reports only credential NAMES, never
 * values, so a preflight can be printed or logged safely.
 *
 * Pure and synchronous: no I/O, so it is fully testable.
 */

export type LiveSuiteId = "email" | "crm" | "payments";

export type LiveSuiteContract = {
  id: LiveSuiteId;
  label: string;
  /** All of these must be present for the suite to run. */
  required: string[];
  /** Any one of these groups also satisfies the suite. */
  alternatives?: string[][];
  /** What the suite proves when it runs. */
  proves: string[];
};

export const LIVE_SUITES: LiveSuiteContract[] = [
  {
    id: "email",
    label: "Transactional email delivery",
    required: ["INTEGRATION_TESTS_ENABLED", "LOVABLE_API_KEY", "INTEGRATION_TEST_EMAIL_TO"],
    proves: [
      "A lead notification is accepted by the email provider",
      "A duplicate send with the same idempotency key is not delivered twice",
    ],
  },
  {
    id: "crm",
    label: "CRM hand-off",
    required: ["INTEGRATION_TESTS_ENABLED", "INTEGRATION_TEST_CRM_WEBHOOK_URL"],
    proves: [
      "Lead form submission reaches the database",
      "The CRM endpoint receives the lead exactly once",
      "A replayed delivery is rejected as a duplicate",
    ],
  },
  {
    id: "payments",
    label: "Checkout and subscription entitlement",
    required: ["INTEGRATION_TESTS_ENABLED", "STRIPE_SANDBOX_API_KEY", "PAYMENTS_SANDBOX_WEBHOOK_SECRET"],
    proves: [
      "A sandbox checkout session is created",
      "A signed webhook updates the subscription and entitlement",
      "An unsigned or replayed webhook is rejected",
    ],
  },
];

export type SuiteStatus = {
  id: LiveSuiteId;
  label: string;
  runnable: boolean;
  /** Names only — never values. */
  missingCredentials: string[];
  proves: string[];
};

export function suiteStatus(
  contract: LiveSuiteContract,
  env: Record<string, string | undefined>,
): SuiteStatus {
  const present = (name: string) => {
    const value = env[name];
    return typeof value === "string" && value.trim().length > 0;
  };
  const groups = [contract.required, ...(contract.alternatives ?? [])];
  const evaluated = groups.map((group) => group.filter((name) => !present(name)));
  const satisfied = evaluated.find((missing) => missing.length === 0);
  const missing = satisfied ? [] : (evaluated[0] ?? []);
  return {
    id: contract.id,
    label: contract.label,
    runnable: Boolean(satisfied),
    missingCredentials: missing,
    proves: contract.proves,
  };
}

export type LivePreflight = {
  status: "RUNNABLE" | "PARTIAL" | "NOT_VERIFIED";
  suites: SuiteStatus[];
  /** Every credential name still needed, de-duplicated. */
  missingCredentials: string[];
};

export function livePreflight(env: Record<string, string | undefined>): LivePreflight {
  const suites = LIVE_SUITES.map((contract) => suiteStatus(contract, env));
  const runnable = suites.filter((s) => s.runnable).length;
  return {
    status: runnable === 0 ? "NOT_VERIFIED" : runnable === suites.length ? "RUNNABLE" : "PARTIAL",
    suites,
    missingCredentials: [...new Set(suites.flatMap((s) => s.missingCredentials))].sort(),
  };
}

/** True only when this suite may talk to a real external service. */
export function liveSuiteEnabled(id: LiveSuiteId, env = process.env as Record<string, string | undefined>) {
  const contract = LIVE_SUITES.find((s) => s.id === id);
  return contract ? suiteStatus(contract, env).runnable : false;
}
