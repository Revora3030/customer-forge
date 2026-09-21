/**
 * CONTRACT FOR THE BROWSER JOURNEY SUITE
 * ======================================
 *
 * Guards the things that make the suite trustworthy, without needing a browser:
 *  - every one of the 22 required journey steps is declared, in order
 *  - external integrations are declared NOT_TESTED, never asserted as passing
 *  - the suite fails the build on a failed step (exit 1)
 *  - reports are written in both machine- and human-readable form
 *  - a produced report, when present, has the expected shape and no fake pass
 */

import { existsSync, readFileSync } from "node:fs";

const driver = readFileSync("scripts/browser-journey.py", "utf8");
const runner = readFileSync("scripts/browser-journey.mjs", "utf8");
const failures = [];

const REQUIRED_STEPS = [
  "01_app_loads",
  "02_no_error_screen",
  "03_auth_session",
  "04_fixture_workspace",
  "05_builder_opens",
  "06_builder_console_clean",
  "07_build_request",
  "08_build_stages",
  "09_preview_renders",
  "10_page_navigation",
  "11_mobile_widths",
  "12_desktop_widths",
  "13_no_overflow",
  "14_actionable",
  "15_real_content",
  "16_builder_edit",
  "17_edit_visible",
  "18_edit_persists",
  "19_rollback",
  "20_rollback_restores",
  "21_publish_gated",
  "22_dashboard_return",
];

const declared = [...driver.matchAll(/\("(\d{2}_[a-z_]+)",/g)].map((match) => match[1]);
for (const [index, step] of REQUIRED_STEPS.entries()) {
  if (declared[index] !== step) {
    failures.push(`Step ${index + 1} must be ${step}, found ${declared[index] ?? "nothing"}.`);
  }
}

for (const width of [320, 375, 390, 414, 1280, 1440]) {
  if (!driver.includes(String(width))) failures.push(`Width ${width} is not covered.`);
}

for (const marker of ["ext_stripe", "ext_email", "ext_crm"]) {
  if (!driver.includes(`"${marker}"`)) failures.push(`External integration ${marker} is not declared.`);
}
if (!driver.includes("not_tested(")) failures.push("External integrations must be marked NOT_TESTED.");
if (!/return 1 if failed else 0/.test(driver)) failures.push("A failed step must fail the build.");
if (!driver.includes("journey.json") || !driver.includes("journey.html")) {
  failures.push("Both JSON and HTML reports must be written.");
}
if (driver.includes("await asyncio.sleep(") && !driver.includes("wait_for_selector")) {
  failures.push("Web-first assertions must be used instead of sleeps.");
}
if (!runner.includes("NOT_VERIFIED")) {
  failures.push("A missing browser runner must report NOT_VERIFIED, never a pass.");
}
if (driver.includes("publish.click()")) {
  failures.push("The suite must never press Publish.");
}

const reportPath = "browser-qa-artifacts/journey.json";
if (existsSync(reportPath)) {
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  if (!["PASSED", "FAILED", "NOT_VERIFIED"].includes(report.status)) {
    failures.push(`Unexpected report status ${report.status}.`);
  }
  for (const step of report.steps ?? []) {
    if (!["PASS", "FAIL", "NOT_TESTED"].includes(step.status)) {
      failures.push(`Step ${step.id} has an unexpected status ${step.status}.`);
    }
    if (step.status === "PASS" && typeof step.durationMs !== "number") {
      failures.push(`Step ${step.id} passed without a recorded duration.`);
    }
    if (step.id?.startsWith("ext_") && step.status === "PASS") {
      failures.push(`External integration ${step.id} must never be reported as passing here.`);
    }
  }
  if (report.status === "PASSED" && (report.failed ?? 0) > 0) {
    failures.push("A report with failures must not be PASSED.");
  }
}

if (failures.length) {
  console.error("browser journey contract FAILED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`browser journey contract PASSED (${REQUIRED_STEPS.length} steps declared in order)`);
