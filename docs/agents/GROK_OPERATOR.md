# Grok operator runbook — REVORA × GROK

How an outside bot (Grok and its specialist bots) works on Revora safely. This page is the contract; the code that enforces it is named next to each rule.

## Architecture

- **Control device:** the founder's iPhone (voice and text to Grok; approvals at `https://revoragrowthsystems.com/admin/approvals`, which can be added to the home screen).
- **Workstation:** Grok's Linux sandbox (`/home/workdir/artifacts`) with `gh`, Node.js and Python, and a GitHub token scoped to `Revora3030/customer-forge`.
- **Platform bridge:** the key-checked gateway `/api/public/agent/*` (header `x-revora-agent-key: $REVORA_AGENT_API_KEY`). The bot never receives database, service-role, Stripe or email credentials.
- **Engineering bridge:** feature branches and pull requests into `lovable-sync`, each carrying an evidence card.

## The four levels (`src/lib/agent-authority.ts`)

| Level | Authority | What the bot may do |
|---|---|---|
| 1 Read | Automated | Read code, CI output, `/health`, `/builds`, `/analytics`, `/briefing`, request status |
| 2 Prepare | Automated | Draft fixes, demo specs, outreach text, reports, PR descriptions |
| 3 Execute (safe) | Automated | Run tests, repair its own branches, open PRs, send leads to the review list, file approval requests |
| 4 Approval required | Founder sign-off | Merge into lovable-sync, deploy/publish the platform, publish a customer site, send cold email or SMS, start paid builds, retry paid jobs, change billing, delete customer data |

A Level 4 action is done **only** after `GET /action-requests/:id` returns `"mayExecute": true`, and only once. The gateway records decisions; it never carries an action out.

## Gateway endpoints

All need `x-revora-agent-key`. Responses are counts, statuses and links — never customer contact details.

| Method and path | Level | Purpose |
|---|---|---|
| `GET /api/public/agent/health` | 1 | Active and failed builds, leads waiting, errors in 24 h, approvals waiting |
| `GET /api/public/agent/builds?status=&limit=` | 1 | Recent builds: status, progress, stage, failure kind, checkpoints |
| `GET /api/public/agent/builds/:id` | 1 | One build's live progress |
| `GET /api/public/agent/analytics?days=30` | 1 | Customers, paying, trialing, published, MRR, funnel stages and rates |
| `GET /api/public/agent/briefing` | 1 | The morning briefing as speakable sentences, plus its numbers |
| `POST /api/public/agent/prospects` | 3 | Up to 25 public leads into the owner review list (`importLeadCsv`) |
| `POST /api/public/agent/action-requests` | 3 | Ask the founder for one Level 4 action |
| `GET /api/public/agent/action-requests/:id` | 1 | The decision: `state`, `mayExecute`, `approvalUrl` |
| `POST /api/public/agent/action-requests/:id/complete` | 3 | Report the result after an approved action |

### Example: ask to merge a PR

```bash
npm run agent:evidence -- --task PR-412 --fix "Booking form keeps the chosen time" --json evidence.json
curl -sS -X POST https://revoragrowthsystems.com/api/public/agent/action-requests \
  -H "x-revora-agent-key: $REVORA_AGENT_API_KEY" -H "content-type: application/json" \
  -d "$(jq -n --slurpfile e evidence.json '{
        kind: "merge_pull_request",
        title: "Merge #412: booking form keeps the chosen time",
        target_url: "https://github.com/Revora3030/customer-forge/pull/412",
        payload: { pr: 412 },
        evidence: $e[0],
        idempotency_key: "grok-pr-412-v1" }')"
# -> { "id": "...", "state": "pending", "mayExecute": false, "approvalUrl": "https://.../admin/approvals?request=..." }
```

Send the `approvalUrl` to the founder's iPhone. Poll `GET /action-requests/:id` (every few minutes, not faster). When `mayExecute` is true, merge, then:

```bash
curl -sS -X POST https://revoragrowthsystems.com/api/public/agent/action-requests/$ID/complete \
  -H "x-revora-agent-key: $REVORA_AGENT_API_KEY" -H "content-type: application/json" \
  -d '{"ok": true, "result_url": "https://github.com/Revora3030/customer-forge/pull/412"}'
```

Rules the gateway enforces: Level 4 kinds only; a merge needs an evidence card; https links only; no credentials in `payload`; the same `idempotency_key` never makes a second request; at most 50 waiting; requests expire after 48 hours; only a pending request can be decided and only an approved one completed.

## Engineering cycle (Phase 4)

1. Read the error (`/health`, CI, `error_events` counts) → open an isolated branch from `lovable-sync`.
2. Make the smallest defensible fix; add or update a test that fails without it.
3. Run `npm run agent:evidence -- --task <id> --failure "<what broke>" --fix "<what changed>"`. It runs `npx vitest run`, `tsc --noEmit` and `npm run build` and prints the card. A non-zero exit means don't open the PR yet.
4. Open the PR into `lovable-sync` with the card (template: `.github/pull_request_template.md`).
5. File a `merge_pull_request` action request with the same card; wait for approval; merge; report completion.
6. Publishing the platform in Lovable is a separate `deploy_production` request — the founder presses Publish.

## Evidence card (Phase 9)

`task_id`, `affected_files`, `observed_failure`, `fix_applied`, `tests {passed, failed, command}`, `typecheck`, `build`, `security`, `rollback`, `ci_url`. Schema: `evidenceCardSchema` in `src/lib/agent-gateway.ts`. Numbers must come from tool output; a check that didn't run is `not_run`. The approvals screen warns the founder when any check failed.

## Verification tooling (Phase 5)

| Tool | Where |
|---|---|
| Playwright journeys | `npm run browser:journey`, `.github/workflows/authenticated-browser-journey.yml`, `browser-qa.yml` |
| axe-core WCAG 2.2 AA | `node scripts/page-sweep.mjs <url> --a11y --target=44 --all-viewports` (320, 390, 768, 1280 px) |
| Trivy | `.github/workflows/trivy.yml` |
| Dependabot | `.github/dependabot.yml` (weekly npm, monthly Actions; PRs only) |
| TruffleHog | `.github/workflows/secret-scan.yml` (verified secrets in new commits fail the check). Locally before a push: `trufflehog git file://. --since-commit origin/lovable-sync --results=verified` |

## Bot team (Phase 6)

| Bot | Owns | Never does |
|---|---|---|
| Grok — coordinator | Briefings, routing work, filing approval requests | Level 4 without `mayExecute` |
| Engineering | Branches, fixes, tests, PRs, evidence cards | Merge, deploy, touch migrations without RLS tests |
| QA | `page-sweep --all-viewports --a11y`, journeys, preview checks | Count HTTP 200 as a pass |
| Security | `npm run security:audit`, RLS tests, secret scans, Stripe invariants | Ask for service-role keys |
| Growth | Public lead discovery with source URLs → `POST /prospects` | Email, SMS or build for a lead |

## Operating cadence (Phase 8, America/New_York)

| When | What |
|---|---|
| 08:00 | `GET /briefing`, add open PRs (`gh pr list`) and failing CI; speak it to the founder |
| Daytime | Event-driven fixes and lead discovery; approval requests as needed |
| 18:00 | QA: `page-sweep --all-viewports --a11y` on the live site and on previews; report regressions |
| 00:00–05:00 UTC | Safe maintenance only: Dependabot PR triage, lint and dead-code PRs. No merges, no paid calls |

## Weekly 16-domain audit (Phase 7)

| # | Domain | Built today | Known gaps |
|---|---|---|---|
| 1 | Lead acquisition | Overture/OSM leads workflow, `POST /prospects`, review queue | Web-health score is the bot's own; send only after approval |
| 2 | Website factory | Worker, checkpoints, `/builds` | No live end-to-end build yet (see `docs/audits/`) |
| 3 | Gateway & telemetry | This page | — |
| 4 | Founder approvals | `/admin/approvals`, Jarvis approvals | No push notification; Grok sends the link |
| 5 | CRM & speed-to-lead | Leads, lead alerts, retry job | Verify SMS provider live |
| 6 | Quotes & work orders | Quotes, estimate builder, printable estimate | No crew work-order view |
| 7 | Bookings | Appointments, overlap checks, reminders job | No `.ics` invites |
| 8 | Reviews | Review requests and public reviews | Seed reviews still appear in JSON-LD on the seed site |
| 9 | SEO | Titles, OG, LocalBusiness/FAQPage JSON-LD, sitemaps | Empty sites are still indexable |
| 10 | Stripe | Webhooks, offer in `src/lib/offer.ts` | Sandbox preflight not verified |
| 11 | Tenancy & security | RLS + coverage tests, security audit | Live two-workspace test needs DB URL |
| 12 | Observability | `error_events`, monitoring page, site-health job | — |
| 13 | PR engine | Evidence script, PR template, CI gates | — |
| 14 | Design system | Composition primitives, 44 px target sweep | Single forced dark canvas |
| 15 | Retention | Weekly and monthly reports, growth digest | Churn signals are basic |
| 16 | Spoken command center | `/briefing` text; Lovable speech exists | Delivery to iPhone is Grok's job |

## Staged autonomy (Phase 10)

1. Read-only audits → 2. isolated PRs → 3. CI-green PRs with evidence → 4. lead ingestion → 5. overnight maintenance → 6. founder-approved Level 4 actions. Move up a stage only after a week without a rejected or reverted change at the current one.

## Invariants

1. The offer is fixed: $350 setup, first month free, then $100/month, with a 3-day full-access trial (`src/lib/offer.ts`).
2. Cold email, SMS, publishing, deploys, merges, billing and deletes need the founder's approval.
3. No AI images or heavy builds for unverified leads without approval.
4. Tenant isolation everywhere; no unrestricted database credentials for any bot.
5. Never invent business facts, awards, reviews, certifications or test results.
