# Platform reliability repair and rollout

This change set repairs specific, reproducible code defects in the AI builder and its surrounding platform controls. It is not a claim that every live integration or production tenant has been verified, and it does not apply migrations, publish a website, or enable a paid provider by itself.

## Changes included

- **Generation queue**: 300-second leases, periodic heartbeats plus explicit renewal around long creative/image stages, attempt/status-fenced claims and settlement, per-job retry delays, exhausted-job cleanup, and tenant-local provider failures instead of global automatic pauses.
- **Request lifetime**: request-scoped background context, tenant-scoped worker kicks, no extra drain after a successful HTTP kick, and an opt-in independent runner that keeps one build request connected.
- **Preview navigation**: Home normalization for shared/private drafts, preservation of preview scope, contact-anchor aliases based on actual page targets, and no duplicate enquiry-form IDs.
- **Missing navigation repair**: separate missing-header/footer messaging, missing-only AI composition, preservation of existing parts and concurrent settings, active-build rejection, cancellation propagation, and preview-refresh notification.
- **AI access and cost controls**: entitlement checks on 12 previously unguarded AI endpoints, manager permission for video/brief/diagnostic mutations, tenant identity on copy/analysis calls, a bounded paid-image deadline, and conservative accounting when a provider outcome is unknown.
- **Lead routing**: HTTPS-only endpoints without credentials or arbitrary ports, public-DNS checks, private/mapped-address rejection, manual redirects, bounded DNS/delivery, explicit configuration failures, and secret-free transport diagnostics.
- **Observability**: actual V8/Node/Firefox/Safari stack parsing, oldest-first Sentry frames, bounded forwarding, and nested telemetry redaction.
- **Verification and migrations**: explicit live-test opt-in, configured CRM fixtures, truthful skip/proof reporting, mandatory tenant checks when a fixture is configured, and a read-only migration plan with target/history guards.
- **Homepage conversion clarity**: correct the free-trial label, label the starter layout as illustrative, and remove unsupported insurance/licensing and rating claims from that sample.

## Validation recorded before handoff

The last complete local suite passed 1,974 tests with six explicit skips: four live-provider checks and two checks needing a published tenant fixture. After the final operator-pause and homepage-copy changes, all 29 targeted queue, homepage, and navigation tests passed; the entire suite was not rerun after those final edits because the owner requested immediate PR delivery.

Type checking, lint, production build, migration safety contracts, repository security checks, and structural readiness audits passed during implementation. Final-commit CI remains the merge gate. Local Chromium checks verified desktop/mobile public-page rendering, viewport fit, and the sign-in/signup mode cycle without observed page errors; authenticated builder actions, production preview tokens, and real integrations were not browser-verified.

## QA inventory and acceptance evidence

The automated tests exercise behavior with controlled database/provider fixtures; those fixtures are not production evidence. Browser checks cover reachable local public surfaces, while authenticated builder, shared-token, CRM receiver, and production deployment checks require their own environment.

| Area or control | Automated/local check | Required deployment check |
| --- | --- | --- |
| Worker retries and cancellation | Queue predicate/update tests, stale attempts, backoff, exhausted retries, operator pause | Complete a real test build with the browser closed; inspect lease updates and stage timings |
| Concurrent requests | Overlapping request-context test | Verify runtime uses Node compatibility for AsyncLocalStorage |
| Home/contact preview links | Pure destination/anchor tests; public and draft route normalization | Open a real shared preview and owner draft; navigate Home, Services, Contact, and new-tab links |
| Missing menu/footer button | Composer tests for preserved header, concurrent edits, cancellation, provider/read failure | Use a test draft missing one part; click repair once; confirm preview updates without changing pages or publishing |
| Billable AI endpoints | Inactive-entitlement tests before provider/write access; viewer-video rejection | Confirm expired and active test workspaces have the intended access |
| Paid image timeout | Stuck-adapter deadline, concurrency release, uncertain-cost retention | Reconcile provider usage against the estimate; never infer zero charge from timeout |
| Webhook destination | Private DNS/IP, IPv6 mapping, redirect, timeout, and secret-redaction tests | Send one approved fixture to the configured receiver; verify receiver-side deduplication and persistence |
| Public marketing/auth UI | Local desktop/mobile navigation, viewport fit, browser error checks | Repeat against the deployed release and monitor Sentry |
| Tenant conversion | Running-server tests; configured missing tenant fails, absent fixture skips explicitly | Run Published Tenant Conversion Check with a confirmed deployment and published tenant slug |
| Migrations | Planner/target/conflict/transaction-control contracts; no remote writes | Reconcile history, back up, dry-run in staging, then explicitly approve production apply |

Exploratory negative cases include a cancelled/superseded build, a webhook resolving to cloud metadata, a provider that ignores abort, a stale menu-repair save, and an invalid published-tenant fixture. A green unit run is not a replacement for the last column.

## Safe deployment sequence

### Review and validate

Review the PR diff and CI results before merging into `lovable-sync`. Preserve Lovable history; do not force-push or rewrite published commits.

```sh
npm run typecheck
npm run lint
node scripts/apply-pending-migrations.contract.mjs
npm run security:audit
npm run repo:audit
npm run build
# With the app already running in another terminal:
INTEGRATION_TESTS_ENABLED=0 E2E_BASE_URL=http://127.0.0.1:8080 npm test
```

### Confirm the database target

Compare the runtime `SUPABASE_URL`, browser `VITE_SUPABASE_URL`, repository configuration, and the connected project before changing any database. A count difference alone is not permission to replay SQL, especially when histories contain renamed/re-versioned migrations.

Start the **Apply Pending Migrations** workflow with `mode=plan` and the confirmed `project_ref`; it reads history only. The database secret must be `REVORA_SUPABASE_DB_URL`, and the runner rejects a direct/pooler URL whose project identity does not match the explicit target.

Resolve every reported history conflict through a reviewed reconciliation, not by deleting migration records or marking unknown SQL applied. Then back up and use a staging `dry-run`; production `apply` requires the separate `APPLY` confirmation, and a dry-run can still take locks or cause non-transactional external effects.

No new database migration is introduced by this repair PR. Existing RPC-hardening migrations still need to be verified on the intended deployment.

### Enable independent build recovery

Configure repository secrets `REVORA_APP_URL` and `LOVABLE_CRON_SECRET` to match the app's trusted HTTPS origin and runtime cron secret. Manually run **Site Engine Queue Runner** once, then set `SITE_ENGINE_RUNNER_ENABLED=1` only after validating the correct deployment.

The scheduled runner processes one job per request, has no overlapping runner jobs, and honors operator pauses. Missing credentials fail an enabled/manual run instead of silently claiming success; the workflow is disabled on its recurring schedule until explicitly enabled.

Cloudflare `waitUntil` provides only a limited post-response grace period, not durable multi-minute execution ([Cloudflare context documentation](https://developers.cloudflare.com/workers/runtime-apis/context/)). The runner reduces dependence on an open customer browser, but a durable Queue/Workflow with resumable stages is still the recommended scalable design; the current build pipeline can restart work after a process dies ([Cloudflare runtime limits](https://developers.cloudflare.com/workers/platform/limits/)).

### Verify CRM and conversions

Set these secrets only for a dedicated receiver-approved test fixture. Do not bypass production validation with a trusted-test header or invented workspace.

```text
INTEGRATION_TESTS_ENABLED=1
INTEGRATION_TEST_CRM_WEBHOOK_URL
INTEGRATION_TEST_CRM_ORGANIZATION_ID
INTEGRATION_TEST_CRM_EMAIL
INTEGRATION_TEST_CRM_PHONE          optional
INTEGRATION_TEST_EMAIL_TO          for the email suite
LOVABLE_API_KEY                    for the email suite
STRIPE_SANDBOX_API_KEY             for sandbox checkout only
PAYMENTS_SANDBOX_WEBHOOK_SECRET    for signature verification
```

The manual **Live Integrations** workflow performs real outbound test actions; obtain the appropriate approval before running it. Its HTTP replay check does not prove exactly-once CRM persistence, email acceptance does not prove inbox delivery, and signature verification does not prove subscription/entitlement updates.

For tenant coverage, run **Published Tenant Conversion Check** with an HTTPS deployment origin and a published slug from that same environment. An explicitly configured but unreachable tenant fails; no configured tenant is reported as skipped/unverified rather than a pass.

### Observe and roll back

After deployment, complete one test build, repair one incomplete draft, open both preview route types, and inspect `generation_jobs.current_step`, `progress`, `attempts`, `lease_expires_at`, `failure_kind`, `failed_stage`, and `stage_timings`. Do not query a nonexistent `generation_jobs.stage` column; `stage` columns on other tables are unrelated.

Look for correctly parsed frames in newly reported Sentry events and correlate them with the deployed release. Do not resolve old production issues solely because a logging fix merged.

If regression occurs, disable `SITE_ENGINE_RUNNER_ENABLED`, stop queued production experiments, and revert the PR through a new GitHub revert commit. These code changes introduce no schema changes to roll back; any separately approved migration needs its own tested recovery plan.

## Remaining platform risks

- **Durable execution and concurrency**: the HTTP runner is an interim recovery mechanism, not stage checkpoints or a cross-worker AI semaphore; local process concurrency limits do not provide a global guarantee.
- **Free-provider accounting and policy**: request-count allowances do not prove token-budget safety, and shared-traffic/free-tier commercial and data-use settings require explicit verification against the actual accounts before production use.
- **Webhook egress**: public DNS checks reduce SSRF exposure but do not pin the actual connection to the verified address; use a controlled egress proxy or approved endpoint policy for stronger DNS-rebinding protection.
- **Runtime verification**: live payments, receiver persistence, authenticated customer journeys, migration state, hosting, and post-deploy error resolution remain separate acceptance gates.
- **Performance**: the production build still reports large chunks; this repair does not certify Core Web Vitals or a whole-platform performance target.
