/**
 * BROWSER SMOKE RUNNER
 * ====================
 *
 * Reproducible entry point for browser evidence. It no longer depends on the
 * `playwright-cli` helper binary, which is not present in every environment.
 *
 * Runner selection, in order:
 *   1. Node Playwright (`playwright` package) via scripts/browser-smoke.node.mjs
 *   2. Python Playwright via scripts/browser-smoke.py
 *
 * When no runner is installed, the run is recorded as NOT_VERIFIED with the
 * reason — never as a pass. `--require-browser` turns that into a hard failure
 * for pipelines that must have browser evidence.
 *
 * CI-friendly: reads no secrets, needs no production credentials. A published
 * site is only checked when REVORA_SMOKE_PUBLISHED_PATH names a fixture path.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const requireBrowser = process.argv.includes("--require-browser");
const artifacts = "browser-qa-artifacts";
mkdirSync(artifacts, { recursive: true });

function writeReport(report) {
  writeFileSync(`${artifacts}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

function hasNodePlaywright() {
  const probe = spawnSync(process.execPath, ["-e", "import('playwright').then(()=>0)"], {
    stdio: "ignore",
  });
  return probe.status === 0;
}

function hasPythonPlaywright() {
  const probe = spawnSync("python3", ["-c", "import playwright"], { stdio: "ignore" });
  return probe.status === 0;
}

const nodeDriver = "scripts/browser-smoke.node.mjs";

let command = null;
let args = [];
let runner = null;

if (hasNodePlaywright() && existsSync(nodeDriver)) {
  command = process.execPath;
  args = [nodeDriver];
  runner = "node-playwright";
} else if (hasPythonPlaywright() && existsSync("scripts/browser-smoke.py")) {
  command = "python3";
  args = ["scripts/browser-smoke.py"];
  runner = "python-playwright";
}

if (!command) {
  writeReport({
    status: "NOT_VERIFIED",
    runner: null,
    reason:
      "No Playwright runner is installed. Install the `playwright` npm package or Python playwright to produce browser evidence.",
    performed: 0,
    failed: 0,
  });
  process.exit(requireBrowser ? 1 : 0);
}

const run = spawnSync(command, args, { stdio: "inherit", env: { ...process.env } });
if (run.error) {
  writeReport({
    status: "NOT_VERIFIED",
    runner,
    reason: `The ${runner} driver could not start: ${run.error.message}`,
    performed: 0,
    failed: 0,
  });
  process.exit(requireBrowser ? 1 : 0);
}
process.exit(run.status ?? 1);
