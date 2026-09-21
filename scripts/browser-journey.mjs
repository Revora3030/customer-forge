/**
 * BROWSER JOURNEY RUNNER
 * ======================
 *
 * CI-safe entry point for the durable customer-journey smoke suite. It needs no
 * Stripe, email, CRM or paid AI credentials.
 *
 * Runner: Python Playwright (scripts/browser-journey.py). When Playwright is not
 * installed the run is recorded as NOT_VERIFIED — never as a pass.
 * `--require-browser` turns that into a hard failure for pipelines that must
 * have browser evidence.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const requireBrowser = process.argv.includes("--require-browser");
const artifacts = "browser-qa-artifacts";
const driver = "scripts/browser-journey.py";
mkdirSync(artifacts, { recursive: true });

function notVerified(reason) {
  const report = { status: "NOT_VERIFIED", reason, passed: 0, failed: 0, notTested: 0, steps: [] };
  writeFileSync(`${artifacts}/journey.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(requireBrowser ? 1 : 0);
}

const hasPython =
  spawnSync("python3", ["-c", "import playwright"], { stdio: "ignore" }).status === 0;

if (!hasPython || !existsSync(driver)) {
  notVerified(
    "Python Playwright is not installed, so no browser evidence could be produced. Install it (pip install playwright && playwright install chromium) and re-run.",
  );
}

const run = spawnSync("python3", [driver], { stdio: "inherit", env: { ...process.env } });
if (run.error) notVerified(`The Playwright driver could not start: ${run.error.message}`);
process.exit(run.status ?? 1);
