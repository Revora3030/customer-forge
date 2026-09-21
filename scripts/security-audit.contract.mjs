/**
 * SECURITY AUDIT CONTRACT
 * =======================
 *
 * Proves the security audit works in a CLEAN CHECKOUT with no environment file
 * present, and that it still fails when a credential file is tracked or a
 * secret-shaped literal is committed. Runs the real script against temporary
 * fixture directories; touches nothing in this repository.
 *
 *   node scripts/security-audit.contract.mjs
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = join(process.cwd(), "scripts", "security-audit.mjs");
const gitignore = ".env\n.env.*\n!.env.example\nnode_modules\n";
const failures = [];

function fixture(name, build) {
  const dir = mkdtempSync(join(tmpdir(), `revora-security-${name}-`));
  writeFileSync(join(dir, ".gitignore"), gitignore);
  writeFileSync(join(dir, ".env.example"), "STRIPE_SANDBOX_API_KEY=\n");
  mkdirSync(join(dir, "security"), { recursive: true });
  cpSync(
    join(process.cwd(), "security", "dependency-exceptions.json"),
    join(dir, "security", "dependency-exceptions.json"),
  );
  build?.(dir);
  spawnSync("git", ["init", "-q"], { cwd: dir, stdio: "ignore" });
  spawnSync("git", ["add", "-A"], { cwd: dir, stdio: "ignore" });
  const run = spawnSync(process.execPath, [script, "--json"], { cwd: dir, encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  return { status: run.status, report: JSON.parse(run.stdout || "{}") };
}

function expectPass(name, result) {
  if (result.status !== 0 || result.report.status !== "PASSED")
    failures.push(`${name}: expected PASSED, got ${result.report.status} (exit ${result.status})`);
}
function expectFail(name, result, needle) {
  if (result.status === 0) failures.push(`${name}: expected failure, exited 0`);
  if (needle && !JSON.stringify(result.report.errors ?? []).includes(needle))
    failures.push(`${name}: expected an error mentioning "${needle}"`);
}

// 1. Clean checkout, no environment file at all.
const clean = fixture("clean");
expectPass("clean checkout with no .env", clean);
if ((clean.report.localEnvironmentFiles ?? []).length !== 0)
  failures.push("clean checkout should report no local environment files");

// 2. Untracked local .env is configuration, not a failure.
const untracked = fixture("untracked-env", (dir) => {
  writeFileSync(join(dir, ".env"), "VITE_SUPABASE_URL=https://example.test\n");
});
expectPass("untracked local .env", untracked);

// 3. A tracked .env file must fail.
const tracked = fixture("tracked-env", (dir) => {
  writeFileSync(join(dir, ".gitignore"), ".env.example\nnode_modules\n");
  writeFileSync(join(dir, ".env"), "SOMETHING=1\n");
});
expectFail("tracked .env", tracked, ".gitignore");

// 4. A committed secret-shaped literal must fail, and must not be echoed.
const leaked = fixture("leaked-secret", (dir) => {
  writeFileSync(join(dir, "config.ts"), `export const key = "sk_test_${"A".repeat(30)}";\n`);
});
expectFail("committed Stripe secret", leaked, "Stripe secret key");
if (JSON.stringify(leaked.report).includes("sk_test_" + "A".repeat(30)))
  failures.push("the audit must never echo a secret value");
if (!(leaked.report.credentialsRequiringRotation ?? []).length)
  failures.push("a detected secret must be reported as requiring rotation (name only)");

// 5. An incomplete documented exception must fail.
const badException = fixture("bad-exception", (dir) => {
  writeFileSync(
    join(dir, "security", "dependency-exceptions.json"),
    JSON.stringify({ exceptions: [{ advisory: "CVE-0000-0000" }] }),
  );
});
expectFail("incomplete dependency exception", badException, "missing required field");

if (failures.length) {
  console.error("Security audit contract failed:");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}
console.log("Security audit contract passed (5 fixtures).");
