/**
 * LIVE INTEGRATION PREFLIGHT
 * ==========================
 *
 * Prints which live email / CRM / payment suites can run in this environment,
 * and exactly which credential NAMES are still missing. Never prints a value,
 * never contacts an external service, never reports a pass it did not observe.
 *
 *   node scripts/integration-preflight.mjs
 *   node scripts/integration-preflight.mjs --json
 *
 * Exit 0 always: a missing credential is a configuration status, not a fault.
 */

const SUITES = [
  {
    id: "email",
    label: "Transactional email delivery",
    required: ["INTEGRATION_TESTS_ENABLED", "LOVABLE_API_KEY", "INTEGRATION_TEST_EMAIL_TO"],
  },
  {
    id: "crm",
    label: "CRM hand-off",
    required: ["INTEGRATION_TESTS_ENABLED", "INTEGRATION_TEST_CRM_WEBHOOK_URL"],
  },
  {
    id: "payments",
    label: "Checkout and subscription entitlement",
    required: [
      "INTEGRATION_TESTS_ENABLED",
      "STRIPE_SANDBOX_API_KEY",
      "PAYMENTS_SANDBOX_WEBHOOK_SECRET",
    ],
  },
];

const present = (name) => {
  const value = process.env[name];
  return typeof value === "string" && value.trim().length > 0;
};

const suites = SUITES.map((suite) => {
  const missing = suite.required.filter((name) => !present(name));
  return { ...suite, runnable: missing.length === 0, missingCredentials: missing };
});

const runnable = suites.filter((s) => s.runnable).length;
const report = {
  status: runnable === 0 ? "NOT_VERIFIED" : runnable === suites.length ? "RUNNABLE" : "PARTIAL",
  suites: suites.map(({ id, label, runnable: ok, missingCredentials }) => ({
    id,
    label,
    runnable: ok,
    missingCredentials,
  })),
  missingCredentials: [...new Set(suites.flatMap((s) => s.missingCredentials))].sort(),
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Live integration preflight: ${report.status}`);
  for (const suite of report.suites) {
    console.log(
      suite.runnable
        ? `- ${suite.label}: ready to run`
        : `- ${suite.label}: NOT VERIFIED — missing ${suite.missingCredentials.join(", ")}`,
    );
  }
  if (report.missingCredentials.length)
    console.log(
      "\nNo external service was contacted. Add the credential names above as server-side secrets to enable these suites.",
    );
}
