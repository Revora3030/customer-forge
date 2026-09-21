/**
 * REPOSITORY SECURITY AUDIT
 * =========================
 *
 * Runs in a clean checkout with no environment file present, and in this
 * workspace where the platform manages a local `.env`. It never depends on a
 * secret being present, and it never prints a secret value.
 *
 * What it checks:
 *  1. No environment or credential file is TRACKED in source control.
 *  2. `.gitignore` still excludes `.env` / `.env.*` (with `.env.example` kept).
 *  3. No secret-shaped literal appears in any tracked or untracked repo file
 *     other than the ignored local environment files themselves.
 *  4. The documented dependency-exception registry is complete and in date.
 *
 * A local, git-ignored `.env` is reported as CONFIGURATION, not as a failure:
 * it is how the platform injects publishable values, and a clean checkout has
 * none. Only a TRACKED environment file is an error.
 *
 * Usage:
 *   node scripts/security-audit.mjs            human output, exit 1 on failure
 *   node scripts/security-audit.mjs --json     machine-readable report
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const asJson = process.argv.includes("--json");

const ENV_FILE_PATTERN = /^\.env(\..+)?$|^\.dev\.vars(\..+)?$|\.pem$|\.key$/;
const ignoredDirs = new Set([
  ".git",
  "node_modules",
  "dist",
  ".output",
  ".tanstack",
  ".nitro",
  ".wrangler",
  "browser-qa-artifacts",
]);

const errors = [];
const notes = [];

/** Files git knows about. Empty list when git is unavailable (still safe). */
function trackedFiles() {
  try {
    return execFileSync("git", ["ls-files"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
  } catch {
    notes.push("git is unavailable, so tracked-file checks were skipped.");
    return null;
  }
}

const tracked = trackedFiles();
const trackedSet = tracked ? new Set(tracked) : null;

// 1. No environment/credential file may be tracked.
if (tracked) {
  for (const path of tracked) {
    const name = path.split("/").pop() ?? path;
    if (name === ".env.example") continue;
    if (ENV_FILE_PATTERN.test(name))
      errors.push(`Environment or credential file is tracked in source control: ${path}`);
  }
}

// 2. .gitignore must keep environment files out.
const gitignore = existsSync(join(root, ".gitignore"))
  ? readFileSync(join(root, ".gitignore"), "utf8")
  : "";
for (const rule of [".env", ".env.*"]) {
  if (!gitignore.split("\n").some((line) => line.trim() === rule))
    errors.push(`.gitignore must contain the rule "${rule}".`);
}
if (!gitignore.split("\n").some((line) => line.trim() === "!.env.example"))
  notes.push(".gitignore does not re-include .env.example; the reference file may be ignored.");

// Local environment files are configuration status, never a failure.
const localEnvFiles = [];
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  if (entry.name === ".env.example") continue;
  if (!ENV_FILE_PATTERN.test(entry.name)) continue;
  const isTracked = trackedSet ? trackedSet.has(entry.name) : false;
  localEnvFiles.push({ file: entry.name, tracked: isTracked });
  if (!isTracked)
    notes.push(`Local environment file present and correctly untracked: ${entry.name}`);
}

// 3. Secret-shaped literals anywhere in the working tree (values never printed).
const secretPatterns = [
  ["Stripe secret key", /sk_(?:live|test)_[A-Za-z0-9]{20,}/],
  ["Stripe webhook secret", /whsec_[A-Za-z0-9]{20,}/],
  [
    "Supabase service-role credential",
    new RegExp(
      ["service", "_role"].join("") + ".{0,80}(?:" + ["eyJ", "sb_secret_"].join("|") + ")",
      "i",
    ),
  ],
  ["Google API credential", /AIza[0-9A-Za-z_-]{30,}/],
  ["OpenAI API key", /sk-[A-Za-z0-9]{30,}/],
  ["PEM private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];

/** Names (never values) of credentials that would need rotation if exposed. */
const exposedCredentialNames = new Set();

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.isFile()) inspect(path);
  }
}

function inspect(path) {
  const rel = relative(root, path).replaceAll("\\", "/");
  const name = rel.split("/").pop() ?? rel;
  if (rel === ".env.example" || rel.endsWith(".lock")) return;

  // A git-ignored local environment file is allowed to hold values. It is only
  // a finding when it is tracked, which check 1 already covers.
  const isLocalEnv = ENV_FILE_PATTERN.test(name) && !rel.includes("/");
  const isTracked = trackedSet ? trackedSet.has(rel) : true;
  if (isLocalEnv && !isTracked) return;

  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(content)) {
      errors.push(`${label} pattern detected in ${rel}`);
      exposedCredentialNames.add(label);
    }
  }
}

walk(root);

// 4. Documented dependency exceptions must be complete and in date.
const exceptionPath = join(root, "security", "dependency-exceptions.json");
let exceptions = { exceptions: [] };
if (existsSync(exceptionPath)) {
  try {
    exceptions = JSON.parse(readFileSync(exceptionPath, "utf8"));
  } catch {
    errors.push("security/dependency-exceptions.json is not valid JSON.");
  }
} else {
  notes.push("No dependency-exception registry present; treated as zero accepted exceptions.");
}

const today = new Date().toISOString().slice(0, 10);
const list = Array.isArray(exceptions.exceptions) ? exceptions.exceptions : [];
for (const [index, entry] of list.entries()) {
  const at = `dependency exception #${index + 1}`;
  for (const field of [
    "advisory",
    "package",
    "path",
    "installedVersion",
    "fixedIn",
    "severity",
    "reachability",
    "exploitability",
    "upstreamConstraint",
    "owner",
    "reviewBy",
  ]) {
    if (!entry || typeof entry[field] !== "string" || !entry[field].trim())
      errors.push(`${at} is missing required field "${field}".`);
  }
  if (!Array.isArray(entry?.compensatingControls) || entry.compensatingControls.length === 0)
    errors.push(`${at} must list at least one compensating control.`);
  if (typeof entry?.reviewBy === "string" && entry.reviewBy < today)
    errors.push(`${at} (${entry.advisory}) is overdue for review since ${entry.reviewBy}.`);
}

const report = {
  status: errors.length ? "FAILED" : "PASSED",
  checkedAt: new Date().toISOString(),
  trackedFileCheck: tracked ? "performed" : "skipped_no_git",
  localEnvironmentFiles: localEnvFiles,
  /** Findings actually fixed in this repository. */
  resolvedFindings: errors.length === 0,
  /** Accepted, documented, upstream-blocked advisories — NOT resolved. */
  documentedExceptions: list.map((entry) => ({
    advisory: entry?.advisory ?? null,
    package: entry?.package ?? null,
    reachability: entry?.reachability ?? null,
    reviewBy: entry?.reviewBy ?? null,
  })),
  credentialsRequiringRotation: [...exposedCredentialNames],
  errors,
  notes,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const note of notes) console.log("note: " + note);
  if (list.length)
    console.log(
      `Documented dependency exceptions (accepted, not resolved): ${list.length}. ` +
        list.map((x) => `${x.advisory} [${x.reachability}] review by ${x.reviewBy}`).join("; "),
    );
  if (errors.length) {
    console.error("Repository security audit failed:");
    for (const error of errors) console.error("- " + error);
    if (exposedCredentialNames.size)
      console.error(
        "Credential types requiring manual rotation (names only): " +
          [...exposedCredentialNames].join(", "),
      );
    console.error("No credential was rotated automatically.");
  } else {
    console.log("Repository security audit passed.");
  }
}

process.exit(errors.length ? 1 : 0);
