# Full site browser audit (free — Playwright + Chromium)

Clicks every menu link, button, tab, accordion and slider on revoragrowthsystems.com
and on a customer site, at desktop (1280×800) and phone (390×844) sizes, and reports
dead clicks, console errors, page crashes, 4xx/5xx responses, zero-size controls,
low contrast and horizontal overflow as one JSON report.

## Run it anywhere

```bash
npm i playwright && npx playwright install --with-deps chromium
BASE_URL=https://revoragrowthsystems.com \
TEST_EMAIL=you+qa@example.com TEST_PASSWORD=... \
node scripts/full-site-audit.mjs
```

Optional: `SITE_PATH=/s/<slug>` (skip discovery), `ALLOW_BUILD=1` (start a build if the
workspace has none), `ALLOW_SUBMIT=1` (really submit forms — off by default),
`MAX_PAGES`, `MAX_TARGETS_PER_PAGE`, `PAGE_BUDGET_SECONDS`, `ARTIFACTS_DIR`.
It never presses Publish, never deletes, and never opens tel:/mailto:/external links.

## Self-hosted n8n

n8n Cloud cannot run this (no Execute Command node, no external packages).
On a self-hosted n8n:

1. Copy `full-site-audit.mjs` to the server, e.g. `/home/node/revora-audit/`, and run
   `npm i playwright && npx playwright install --with-deps chromium` in that folder.
2. Enable the Execute Command node (it is disabled by default since n8n 2.0) — see
   https://docs.n8n.io/deploy/host-n8n/configure-n8n/security/block-specific-nodes/
3. Set environment variables on n8n: `TEST_EMAIL`, `TEST_PASSWORD`,
   `QA_ALERT_WEBHOOK_URL` (a Slack or Discord incoming webhook), optionally
   `REVORA_AUDIT_DIR`, `BASE_URL`, `SITE_PATH`.
4. Import `full-site-audit.n8n.json`. It runs every morning at 07:00 (and on "Run now"),
   reads the JSON report, and posts to the webhook only when something failed.
