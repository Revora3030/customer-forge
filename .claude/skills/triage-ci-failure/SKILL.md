---
name: triage-ci-failure
description: Find the cause of a failing GitHub Actions check on a Revora PR quickly and cheaply, reproduce it locally, and fix only what failed. Use when a PR check is red or someone asks why CI failed.
---

# Triage a CI failure

## 1. Find the failing step, not the whole log
- `revora-jarvis-readonly` MCP: `revora_recent_ci` lists recent runs and failing jobs.
- GitHub MCP: list the PR's check runs, then fetch only the failed job's log (`get_job_logs` with `failed_only`, tail ~150 lines).
- Read from the bottom up: the first `Error`/`FAIL`/`✗` line after the step header is usually the cause; later errors are often fallout.

## 2. Map the step to a local command
| Check / step | Local command |
|---|---|
| Typecheck | `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit` |
| Lint | `npx eslint <files from the error>` |
| Repository security audit | `npm run security:audit` |
| Whole-repository audit / visual output / ultimate builder | `npm run repo:audit` / `npm run repo:visual-output` / `npm run builder:ultimate-audit` |
| Production readiness (+ max, controls) | `npm run production:readiness` / `:max` / `npm run production:controls` |
| Test with coverage | `npx vitest run <failing test file>` |
| Production build / client bundle guard | `npm run build && node scripts/client-bundle-guard.mjs` |
| base-branch-guard | `bun install --frozen-lockfile && bunx vitest run <file>` |
| Secret scan (TruffleHog/gitleaks) | inspect the reported file/line; never print the value |
| Semgrep / CodeQL / DevSkim / OSV / Trivy | read the rule id and file:line in the annotation; fix the code, don't suppress |

## 3. Reproduce, then fix
1. Run the local command and confirm the same failure. If it passes locally, check Node version (CI: 22), clean install (`npm install --no-audit --no-fund`), and env-dependent code paths.
2. Fix the smallest thing that makes that check pass. Use the systematic-debugging skill for anything non-obvious.
3. Re-run the same command and show it passing; then run the sibling tests of anything you touched.

## Never
- Skip, `.skip`, delete or loosen a test or audit rule; add ignore comments to silence a scanner; push empty commits or re-run jobs hoping for green.
- Assume flakiness without evidence: re-run the failing test locally 3 times first and report the result.
