---
name: run-ci-locally
description: Reproduce the Revora Quality Gate (.github/workflows/quality-gate.yml) locally before pushing or when a CI step fails. Use when asked to "run CI", "check before push", or to reproduce a failing quality-gate step.
---

# Run CI locally

Run the cheapest steps first and stop at the first failure; fix it before running anything slower.

## 0. Install (only if `node_modules` is missing)
```bash
npm install --no-audit --no-fund
```

## 1. Fast gates (seconds each)
```bash
NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit
npx eslint $(git diff --name-only --diff-filter=ACMR origin/lovable-sync... -- '*.ts' '*.tsx')
npm run security:audit
npm run security:audit:test
node scripts/website-rpc-security.contract.mjs
node scripts/apply-pending-migrations.contract.mjs
npm run browser:journey:test
npm run jarvis:mcp:contract
```

## 2. Repository audits
```bash
npm run lint
npm run repo:audit
npm run repo:visual-output
npm run builder:ultimate-audit
npm run repo:audit:test
npm run production:readiness
npm run production:readiness:max
npm run production:controls
```

## 3. Tests, then build
- Changed area only: `npx vitest run <the test files you touched or their siblings>`.
- Full suite (only before a push): `npx vitest run --exclude src/lib/flows.e2e.test.ts --exclude ".claude/**" --exclude "**/node_modules/**"`.
- CI runs `npm run test:coverage` with an E2E dev server on :8080; reproduce a server-dependent failure with `npm run dev -- --host 127.0.0.1 --port 8080 &` first.
- `npm run build` then `node scripts/client-bundle-guard.mjs` (server-only code must not reach the client bundle).

## Report
List each step as pass/fail with the first failing line of output. Never skip or disable a check to get green; if a step needs credentials you don't have (drift audit, live integrations), say it was not run.
