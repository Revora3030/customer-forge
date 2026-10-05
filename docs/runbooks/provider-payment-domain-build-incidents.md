# Runbook: provider outages, payment failures, domain/SSL, stuck builds

Companion to `incident-response.md` (severity levels) and `release-rollback.md`.
Never paste secrets, card data or customer PII into tickets, PRs or chat.

## 1. AI provider outage or rate limiting

**Signals:** `generation_jobs.error_message` tagged `[provider]`; queue state paused with reason
`rate_limit` or `credits`; `ai_events` rows with `ok=false` concentrated on one provider; breaker
cooldowns visible on the AI health view.

1. Check the AI health/command center view: which provider, which capability, since when.
2. The router already opens a per-provider circuit breaker and fails over **only** to models verified
   for the same capability (`src/lib/ai/team-roles.ts` → `chooseFallback`). Do not add unverified or
   paid models to the chain to "unstick" builds.
3. If no verified fallback exists, builds stay queued with an honest message. That is correct
   behavior; customers are not charged and nothing is lost.
4. A `402/403` (credits/policy) pause needs an owner/admin to restore access, then resume the queue.
5. After recovery: confirm new `ai_events` succeed, the queue resumes, and stalled jobs are re-claimed
   (lease recovery is automatic within ~60s of lease expiry).

## 2. Payment / webhook failure

**Signals:** Stripe dashboard shows failed webhook deliveries; `payment_events` stops receiving rows;
customers report "paid but still locked".

1. Verify the webhook signing secret is configured for the current environment (test vs live). The
   endpoint rejects unsigned/invalid events **before** parsing; never disable that check.
2. Re-deliver the failed events from the Stripe dashboard. Handling is idempotent on
   `(provider, provider_event_id)`, so re-delivery cannot double-apply.
3. Entitlement is derived from verified webhook state only. Never mark an organization paid manually
   in the UI or by editing client state. If a manual correction is unavoidable, do it with the service
   role, record an `audit_logs` row with reason and actor, and reconcile with Stripe.
4. Pricing is immutable ($750 setup, 3-day full access, first month free, $100/month). Do not create
   new products or prices to work around an incident.
5. The setup-fee waiver exists **only** for Revora's internal workspace, and every grant is audit-logged.

## 3. Custom domain / SSL

**Signals:** domain status not `connected`/`ssl_active`; visitors see certificate errors.

1. Check the domain's DNS records against the instructions shown in the workspace's domain settings.
2. Until a domain is verified, the site stays on its isolated `/s/:slug` preview path. Never point a
   customer domain at another tenant or at `revoraweb.site` (traffic/redirect-only).
3. Canonical URLs switch to the custom domain only after verification.
4. After DNS is fixed, re-run verification and confirm HTTPS with a real request.

## 4. Stuck or failing first builds

**Signals:** builder shows "Reconnecting to your build…"; job `processing` with a lease expired more
than 60s ago; repeated `[infrastructure]` tags.

1. Recovery is automatic: the worker sweep re-queues a job with attempts left, otherwise fails it with
   a clear "press Build to try again" message. The client keeps nudging the worker every 15s while a
   job is stalled.
2. Only one active build per workspace can exist (`generation_jobs_one_active_per_org`). A second
   start returns the running job; never delete the index to force a new build.
3. Read the failure kind from the `[kind]` prefix on `error_message`
   (`src/lib/builder/build-failure.ts`): `intake_validation` needs the owner to add details;
   `provider` follows section 1; `image` keeps pages and allows image-only retry; `infrastructure`
   self-recovers.
4. If `LOVABLE_CRON_SECRET` is missing, builds only progress while the owner's browser is open. Set
   it in the hosting environment.

## 5. Post-incident

Add a regression test for the root cause, link the PR, and record timeline, impact (tenants affected,
no secrets) and prevention in the incident record.

## Build cancel, picture approvals, publish checks and alerts

- **Cancel a build:** owners/managers press *Cancel build* (Site Engine panel). The job becomes `cancelled` (terminal, outside the one-active index), the worker stops at its next stage write (all stage/complete writes require `status = processing`), its AI pictures are cleaned up and a fresh rebuild restores its backup. A new build can start immediately. Audit: `audit_logs.action = BUILD_CANCELLED`.
- **Failed build:** `generation_jobs.failure_kind` and `failed_stage` say what failed and where; the owner sees the label from `describeBuildFailure`. *Retry build* reruns the whole pipeline (stages are not checkpointed).
- **Pictures:** `image_records` holds one row per slot. A stuck `regenerating` row (worker died mid-call) can be reset by an admin: `update image_records set status='failed' where status='regenerating' and updated_at < now() - interval '10 minutes';` The owner then regenerates that one picture.
- **Publish smoke failed:** see `publish_events.smoke_report` and `audit_logs.action = PUBLISH_SMOKE_FAILED`. The live version is not rolled back automatically; fix the cause and publish again, or select the previous version in *Publish a specific version* and publish it.
- **Alerts (Admin → Monitoring):** build success < 80% (≥ 5 finished builds), p90 build > 15 min, ≥ 3 provider failures, any failed live check. Each alert links to its runbook section above.
