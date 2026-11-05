# Lead-delivery watchdog

Confirms that every real lead's **owner alert email** was accepted by the email provider, and acts when it was not.

## What it checks (facts from the code)
- A lead is saved by `submitPublicLead` (`src/lib/public-site.functions.ts`); the owner alert is sent afterwards (best effort) via `sendLeadAlert` (Lovable managed email, idempotency key `lead-alert-<leadId>`). Every attempt writes a `lead_alert_log` row (`status` `sent` / `failed`, `reason`).
- "Delivered" = a `lead_alert_log` row with `status = 'sent'`, i.e. **the provider accepted it**. The provider API exposes no inbox-delivery receipt or bounce webhook, so the watchdog cannot see a message that is accepted and later bounces. It says "accepted", never "delivered to the inbox".
- Test leads (`source = 'test_lead'`), demo workspaces and suspended workspaces are ignored. Owners who switched alerts off (`notify_on_lead = false`) are owed nothing.

## What it does (every 5 minutes)
`pg_cron` job `revora-lead-delivery-watchdog` (`*/5 * * * *`) -> `public.call_revora_job('lead-delivery-watchdog', 600000)` -> `POST /api/public/jobs/lead-delivery-watchdog` (cron-authenticated, `src/lib/lead-delivery-watchdog.server.ts`). GitHub Actions calls it hourly at :10 as a backstop.

Threshold: a lead with no accepted alert **5 minutes** after it was created is "delayed". Looks back 72 hours (and at any lead with an open flag).

1. **Retry** with the lead's original idempotency key (so it can never become a second email). Backoff 0, 10, 30, 60, 180 minutes, then 5 attempts maximum -> `exhausted`.
2. **Flag**: row in `lead_delivery_watch` (`state = open`, `problem`, `reason`, `attempts`). The owner sees a banner on `/app` and `/app/leads` (RLS: members read their own workspace's rows). `/admin` and `/admin/monitoring` show the watchdog heartbeat and every open flag. Problems that retries cannot fix (`failed_permanent` = suppressed inbox, `no_alert_inbox`, `exhausted`) also create an in-app `notifications` row for the owner, once.
3. **Log**: every action is a `lead_watchdog_events` row; one `run` heartbeat per pass (kept 14 days, other events 90).
4. A flag closes by itself when an alert is accepted, the owner turns alerts off, or the owner changes a bad inbox (a changed inbox gets a fresh retry).
5. At most one email a day, to Revora's own inbox only (`REVORA.email`, via `lifecycle_email_log` claim), while anything still needs a person. No lead details in it. **It never emails a customer or a lead's visitor.**

`/admin` shows the watchdog as silent if there is no heartbeat for 20 minutes.

## Routing audit: right workspace, right recipient (read-only)
The watchdog above asks "was an alert accepted, and if not, retry". The routing audit asks the independent question: **did every accepted form reach the right workspace and the right recipient.** It reads stored rows only (`leads`, `lead_alert_log`, `lead_delivery_logs`, `business_profiles`, `website_settings`, `lead_delivery_watch`) and sends, writes and charges nothing. No migration.

- Code: `src/lib/lead-delivery-audit.ts` (pure rules), `.server.ts` (SELECT-only loader), `.functions.ts` (super-admin server fn), `src/components/app/LeadRoutingAudit.tsx` ("Routing check" section inside the existing /admin and /admin/monitoring "Lead alert delivery" panel).
- Window: real leads from the last 72 hours; test leads (`source = test_lead`), demo and suspended workspaces are skipped. A lead is judged only after 20 minutes (one watchdog cycle).
- Findings (severity): `alert_wrong_workspace` / `webhook_wrong_workspace` (critical: a delivery row for the lead is filed under a different workspace); `alert_wrong_recipient` (critical: sent to another workspace's address or to an address on no workspace; high: went to a secondary address instead of the alert inbox; medium: the workspace's contact settings changed after the alert, so confirm); `alert_missing`, `alert_failed`, `no_alert_inbox`, `webhook_missing`, `webhook_failed` (high). A transient webhook failure the retry sweep is still working on is not a finding. Findings say whether the watchdog already has the lead flagged.
- Privacy: findings carry workspace name, age, reason and a masked address (`o***@acme.test`); never a lead's name, email or phone, and never the webhook URL.
- If `lead_delivery_logs` is not in the database yet, webhook routing is reported as "not checked", never as a pass.
- Tests: `lead-delivery-audit.test.ts` (rules on fixture rows), `lead-delivery-audit.server.test.ts` (loader over an in-memory database that throws on any write), and `lead-delivery-audit.live.test.ts`, which runs the same audit on the REAL rows and fails on any finding. The live test is skipped (announced as NOT_VERIFIED) unless you run: `LEAD_DELIVERY_AUDIT_LIVE=1 SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bunx vitest run src/lib/lead-delivery-audit.live.test.ts`. It only SELECTs.
- Limits: it cannot see an alert that the provider accepted and that later bounced (no receipt exists), and it cannot know a workspace's alert inbox at the moment of an old alert, only today's settings (hence the "medium" confirm case).

## Boundary with other owners
- **Client Success** owns end-to-end journey proof (a one-off test lead through a customer's site and a check that the owner email arrives). They run it on demand.
- **Site Factory** (README item 25, `sf/post-publish-verify`) owns post-publish verification that the form reaches its recipient at publish time.
- **This watchdog** is the always-on production monitor for real leads after that. If Client Success's journey proof finds a delivery problem, fix the cause; the watchdog will show real leads hitting it. It does not replace either.

## Operate it
- Needs no new secret: it uses the existing `LOVABLE_CRON_SECRET`, `REVORA_APP_URL`, and the existing email sender.
- The migration `20261101010000_lead_delivery_watchdog.sql` must be applied (Manager/Adam applies it through Lovable; a bot cannot apply it to production). Until then the job route errors on the missing tables and the banners render nothing.
- Run by hand: `select public.call_revora_job('lead-delivery-watchdog', 600000);`
