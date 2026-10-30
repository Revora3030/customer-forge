#!/usr/bin/env node
/**
 * Evidence card for a bot pull request (roadmap Phases 4 and 9).
 *
 * Runs the repo's checks on the current branch and prints:
 *   - a Markdown card to paste into the pull request body, and
 *   - (with --json) the `evidence` object for POST /api/public/agent/action-requests.
 *
 * Usage:
 *   node scripts/agent-evidence.mjs --task T-123 [--failure "..."] [--fix "..."]
 *        [--rollback "..."] [--skip-build] [--skip-typecheck] [--json out.json]
 *
 * Numbers come from the tools' own output; nothing is assumed. A check that
 * didn't run is reported as "not_run", never as passed.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined;
};

const run = (cmd, cmdArgs, extraEnv = {}) =>
  spawnSync(cmd, cmdArgs, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...extraEnv } });

const base = value("base") ?? "origin/lovable-sync";
const diff = run("git", ["diff", "--name-only", `${base}...HEAD`]);
const affected = diff.status === 0 ? diff.stdout.split("\n").map((s) => s.trim()).filter(Boolean) : [];

// Tests: vitest's JSON reporter gives exact counts.
const out = join(mkdtempSync(join(tmpdir(), "evidence-")), "vitest.json");
const vitest = run("npx", ["vitest", "run", "--reporter=json", `--outputFile=${out}`]);
let tests;
try {
  const report = JSON.parse(readFileSync(out, "utf8"));
  tests = { passed: report.numPassedTests ?? 0, failed: report.numFailedTests ?? 0, command: "npx vitest run" };
} catch {
  tests = undefined;
}

const status = (result) => (result === null ? "not_run" : result.status === 0 ? "passed" : "failed");
const typecheck = flag("skip-typecheck")
  ? null
  : run("npx", ["tsc", "--noEmit", "-p", "."], { NODE_OPTIONS: process.env.NODE_OPTIONS ?? "--max-old-space-size=6500" });
const build = flag("skip-build") ? null : run("npm", ["run", "build"]);

const evidence = {
  task_id: value("task") ?? `branch:${run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim()}`,
  affected_files: affected.slice(0, 200),
  ...(value("failure") ? { observed_failure: value("failure") } : {}),
  ...(value("fix") ? { fix_applied: value("fix") } : {}),
  ...(tests ? { tests } : {}),
  typecheck: status(typecheck),
  build: status(build),
  security: value("security") ?? (affected.some((f) => f.startsWith("supabase/migrations/")) ? "Migration changed: RLS and adversarial test required (SECURITY.md)." : "No migration changed."),
  rollback: value("rollback") ?? "Revert the merge commit on lovable-sync.",
  ...(value("ci") ? { ci_url: value("ci") } : {}),
};

const lines = [
  "### Evidence card",
  "",
  `| Field | Value |`,
  `|---|---|`,
  `| Task | ${evidence.task_id} |`,
  `| Files | ${affected.length} changed |`,
  `| Problem | ${evidence.observed_failure ?? "—"} |`,
  `| Fix | ${evidence.fix_applied ?? "—"} |`,
  `| Tests | ${tests ? `${tests.passed} passed, ${tests.failed} failed` : `could not be read (vitest exit ${vitest.status})`} |`,
  `| Type check | ${evidence.typecheck} |`,
  `| Build | ${evidence.build} |`,
  `| Security / RLS | ${evidence.security} |`,
  `| Rollback | ${evidence.rollback} |`,
  "",
  "<details><summary>Changed files</summary>",
  "",
  ...affected.map((f) => `- \`${f}\``),
  "",
  "</details>",
];
process.stdout.write(`${lines.join("\n")}\n`);
const jsonPath = value("json");
if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`);

const failed = (tests?.failed ?? 1) > 0 || evidence.typecheck === "failed" || evidence.build === "failed";
process.exit(failed ? 1 : 0);
