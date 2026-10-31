# Revora Growth Systems — Bot Knowledge Pack

Documentation only. This folder copies every project memory file in full (same names, one
markdown file each) and adds this guide for outside bots (Grok bots, Claude Code, other agents)
working on the repository. **It holds no secret values.** Environment variable *names* appear only
so bots know what exists; never put values in code, chat, PRs or this folder.

Snapshot date: 2026-10-31 (UTC). Memory files describe owner decisions **and** strategy ideas.
Treat `strategy/*` files as plans, not proof that a feature exists. Check the code before claiming
anything works.

## Folder contents

| Path | What it is |
| --- | --- |
| `~user.md` | Owner's personal chat preferences |
| `index.md` | Memory index: core rules plus a link list of every memory |
| `features/*` | Owner decisions and feature rules (binding) |
| `strategy/*` | Strategy, roadmaps, blueprints (direction, not verified features) |
| `marketing/*` | Marketing notes |
| `audit/*` | Past audit snapshots (point-in-time, recheck before relying on them) |

Note: a few memory files contain stray `*** Update File: mem://index.md` lines from how they were
originally saved. They were kept as-is so the copies are unabridged.

---

## 1. Canonical business rules (binding)

- **Offer:** $350 one-time setup, first month free, then $100/month. 3-day full-access free trial.
  Never reintroduce $750 (some older memory/docs still say $750 — they are outdated; the owner
  set $350 on 2026-10-07 and reconfirmed 2026-10-22). Change only on explicit owner request.
- **Setup-fee waiver:** only Revora's own workspace (fixed org-id check in `src/lib/platform-owner.ts`). Never extend.
- **Super admins:** only `revorabusiness0@gmail.com` and `godbody4040@gmail.com`.
- **Test accounts:** `bigdawg09091@gmail.com`, `danaysiaingram42@gmail.com` are Revora's own tests — never leads, checkouts or customers.
- **Domains:** primary `revoragrowthsystems.com`. `revoraweb.site` is traffic/redirect only.
- **Customer sites** live only on verified custom domains or `/s/:slug` previews.
- **No Revora phone number** on public pages (email and Jarvis only). Revora is open 24 hours.
- **Truth:** never invent facts, reviews, awards, certifications, prices or results in any copy.
- **AI provider:** Lovable AI only. Never add a second/backup/free provider lane. When capped or down, jobs wait.
- **Spend:** Luna monthly cap $100; shared daily paid cap; 5 full builds per workspace per 24h.
- **Design:** each client gets its own brand and AI-authored direction; no generic white/cream defaults; no forced Revora black-and-gold on customer sites.
- **Instagram:** every post needs the owner's approval of that exact post.
- **Prospects:** target no-website and verified weak-website businesses with a public email; pitch only verified gaps; cold outreach never uses Lovable's built-in app email.
- **Live sites:** changes on an already-live site go straight to live after an undo point, keeping fact, spend, daily-build and broken-page checks.
- **Analytics:** never double count; `signup_completed` once only.

## 2. Route map (`src/routes`)

**Public marketing & SEO:** `/` (index), `/about`, `/pricing`, `/contact`, `/get-started`, `/signup`,
`/login`, `/auth`, `/reset-password`, `/privacy`, `/terms`, `/tools`, `/share`, `/portal`,
`/growth-assessment`, `/website-audit`, `/crm-for-contractors`, `/crm` + `/crm/$trade`,
`/compare` + `/compare/$slug`, `/guides` + `/guides/$slug`, `/industries` + `/industries/$slug`,
`/local` + `/local/$industry` + `/local/$industry/$state`, `/locations` + `/locations/$city`,
`/states` + `/states/$state`, `/demo`, `/demo/dashboard`, `/invite/$token`,
`/unsubscribe/lifecycle/$token`, `/unsubscribe/outreach/$token`, catch-all `$`.

**Customer sites & previews:** `/s/$slug`, `/s/$slug/$page`, `/s/$slug/sitemap.xml` (customer previews),
`/p/$token`, `/p/$token/$page` (private prospect demos).

**Signed-in customer workspace (`_authenticated`):** `/app` (index), `/app/ai`, `/app/analytics`,
`/app/automations`, `/app/billing`, `/app/calendar`, `/app/campaigns`, `/app/command`, `/app/domain`,
`/app/launch`, `/app/leads`, `/app/quotes`, `/app/reviews`, `/app/services`, `/app/settings`,
`/app/website`, `/app/welcome`, `/onboarding`, `/my` (index), `/my/activity`, `/my/site`, `/my/start`,
`/draft/$slug`, `/draft/$slug/$page`.

**Super-admin (`_authenticated/admin.*`):** `/admin` (index), `/admin/ai`, `/admin/analytics`,
`/admin/approvals`, `/admin/backups`, `/admin/city` (AI City), `/admin/clients`, `/admin/clients/$orgId`,
`/admin/command`, `/admin/domains`, `/admin/growth`, `/admin/jarvis`, `/admin/monitoring`,
`/admin/monthly`, `/admin/outreach`, `/admin/payments`, `/admin/plans`, `/admin/seo`, `/admin/websites`.

**Machine files:** `/robots.txt`, `/sitemap.xml`, `/sitemaps/sites.xml`, `/llms.txt`,
`/manifest.webmanifest`, `/indexnow-key.txt`, `/{key}.txt`, `/.well-known/oauth-protected-resource`,
`/.lovable/oauth/consent`, `/mcp` (MCP server).

**Server routes (`/api/public/*` — no site login; each handler must check the caller):**
- Agent gateway (key-checked, `REVORA_AGENT_API_KEY` header): `agent/health`, `agent/briefing`,
  `agent/analytics`, `agent/builds`, `agent/builds/$id`, `agent/prospects`, `agent/action-requests`,
  `agent/action-requests/$id`, `agent/action-requests/$id/complete`.
- Scheduled jobs: `jobs/automation-runs`, `backup`, `growth-digest`, `jarvis-routines`,
  `lead-alert-retry`, `lead-reminder`, `lifecycle-email`, `media-cleanup`, `prospect-autopilot`,
  `prospect-replies`, `site-content-audit`, `site-engine`, `site-health`, `site-hosting`, `weekly-report`.
- Webhooks/callbacks: `payments/webhook` (Stripe), `twilio/inbound`, `instagram/callback`,
  `jarvis-voice`, `altcha`, `preview-beacon`, `maps-photo/$org/$index` (redirects to Google live).
- Lovable email hooks: `/lovable/email/auth/preview`, `/lovable/email/auth/webhook`, `/lovable/email/transactional/preview`.

## 3. Core systems

- **Jarvis** (`/admin/jarvis`, dock across admin): super-admin AI operator. Uses the shared router;
  conversations in owner-only `jarvis_conversations`/`jarvis_messages`; every model round, tool call
  and proposal recorded in `jarvis_run_events`; routines in `jarvis_routines` (claim-before-dispatch,
  never auto-retry unresolved runs); approvals in `jarvis_approvals`/`approval_queue`; memories in
  `jarvis_memories` (+ `jarvis_memory_embeddings`). Diagnostics are allow-listed and read-only until requested.
- **AI City** (`/admin/city`): super-admin 3D view of real queues, Jarvis evidence and AI traces.
  Polling never starts work; only real running heartbeats animate. Missions go into existing reviewed executors.
- **Site engine / builder:** AI team (Sol designs/writes, Terra reviews, Luna metadata) builds every
  site; no non-AI template engine. Jobs in `generation_jobs` run in the worker
  (`src/lib/site-engine.worker.server.ts`), kicked by the database (`call_revora_job`, pg_net) — never
  inside a browser request. Stages checkpoint on the job row; capacity waits set
  `resumes_at`/`wait_reason`. Router: `src/lib/ai/router.server.ts`; thinker:
  `thinker.server.ts`; rosters in `config.ts` filtered by the live Lovable catalogue.
- **Publishing:** one path only — `publishSiteNow` in `production.functions.ts` (role, payment/readiness
  gates, production snapshot, live switch). Live-site edits must go through it.
- **Prospecting/outreach:** OpenStreetMap by default; leads enter owner review via `importLeadCsv`;
  sending queues `prospect_send_queue`, suppressions `prospect_do_not_contact`; outreach emails always include the setup/monthly price sentence.
- **Customer CRM/forms:** `leads`, `quotes*`, `appointments`, `reviews`, `review_requests`; public form
  submissions go through `submit_public_conversion`.

## 4. Integrations (connected or coded; names only)

Lovable Cloud (database, auth, storage, functions), Lovable AI (only AI provider), Stripe (billing +
webhook), Cloudflare Workers (hosting), GitHub (`lovable-sync` branch sync), Gmail OAuth, Twilio
(SMS inbound), Instagram (owner-scoped OAuth, approval per post), ElevenLabs (Jarvis voice playback),
Perplexity (two separate keys: managed `PERPLEXITY_API_KEY`, owner's `PERPLEXITY_API_KEY_1`),
Google Maps photos (live redirect, credited, never stored), OpenStreetMap/Nominatim, IndexNow,
Sentry, Altcha (form bot check), built-in MCP server at `/mcp`. Agent key name: `REVORA_AGENT_API_KEY`.

## 5. Database & auth overview (no secrets)

- Multi-tenant by `organization_id`; row level security on public tables; tenant membership in
  `memberships` / `org_team_members`; org records in `organizations`.
- Roles enum `app_role`: `owner`, `admin`, `manager`, `staff`, `viewer`; platform roles in `user_roles`
  (super_admin limited to the two owner emails). Support access via `support_sessions`.
- Main table groups (selected): websites — `website_settings`, `website_pages`, `website_sections`,
  `website_versions`, `website_branches`, `website_components`, `website_memory`, `website_preview_links`,
  `publish_events`, `media`, `image_records`; build — `generation_jobs`, `builder_messages`,
  `builder_progress`, `ai_team_trace`, `site_vitals`, `website_visual_reports`; AI spend —
  `ai_usage_events`, `ai_paid_spend_reservations`, `ai_paid_daily_budget`, `luna_budget_state`,
  `luna_usage_events`, `ai_model_registry`; billing — `subscriptions`, `payments`, `payment_events`,
  `invoices`, `plans`, `plan_entitlements`, `offer_config`, `platform_trials`; CRM — `leads`,
  `lead_activities`, `lead_tasks`, `customers`, `quotes`, `quote_*`, `appointments`, `services`,
  `reviews`, `review_requests`, `campaigns`, `automations`, `automation_runs`; growth — `growth_businesses`,
  `prospect_*`, `marketing_conversions`, `analytics_events`; agents — `agent_action_requests`,
  `audit_logs`; backups — `data_backups`.
- Generated files never hand-edited: `src/integrations/supabase/types.ts`, `client.ts`, `src/routeTree.gen.ts`.

## 6. Known issues & failed builds (as of 2026-10-31)

- **Oak City Plumbing Test DEMO build** (job `b14ff0b5-…`, Oct 30 ~03:47 UTC): failed 3/3 at the
  content-integrity gate (`assertContentIntegrity`, `src/lib/builder/content-integrity.ts`) because the
  profile email used an example domain. No AI call, cap or timeout. The error was mislabeled
  "worker interrupted" (`src/lib/builder/build-failure.ts` maps it to infrastructure) — fix pending:
  make intake/integrity failures non-retryable with a clear field message.
- **New workspaces' public forms fail** with `ORG_NOT_PUBLIC` until the workspace has a website
  settings row / preview state (seen for `qa-test-plumbing-svcqa1030`).
- **Migration history mismatch:** ~193 repo migration files vs 139 tracked live versions; most changes
  are applied but not tracked. Do not "re-apply" blindly.
- **`site-models` storage bucket** MIME restriction (`model/gltf-binary`) still unset.
- **Stripe webhook secret** was noted unset in a sandbox (name: `STRIPE_WEBHOOK_SECRET`); confirm in production settings.
- **Misplaced test file** `src/routes/api/public/jobs/growth-digest.test.ts` inside routes (build warning).
- Booking-form service/scroll reset on client sites was fixed (regression test `src/components/site/SiteForms.booking-hash.test.tsx`).
- Live verification gaps: no recent end-to-end paid checkout, live reference build, or verified outreach sender.

## 7. How outside bots should work on this repo

1. **Read first:** root `AGENTS.md`, `CLAUDE`-style notes, this folder, and `docs/agents/GROK_OPERATOR.md`.
   Subdirectories may have their own `AGENTS.md`.
2. **Branches:** branch from `lovable-sync`, one bot per change (`agent/<bot>/<slug>`). Never
   force-push or rewrite pushed history. Never commit secrets.
3. **Talk to the platform only through** key-checked `/api/public/agent/*` routes. Bots never get
   database keys, never contact anyone directly, never start paid builds.
4. **Authority levels:** L1 read, L2 prepare (drafts, PRs), L3 safe execute (tests, own branch,
   prospects into review queue, file action requests). **L4 needs founder approval of that one
   request on `/admin/approvals`** via `POST /api/public/agent/action-requests`: merge, deploy,
   publish, send, paid build, billing, delete. The gateway records decisions; it never performs them.
5. **Checks before a PR (smallest first):** one test file `npx vitest run path/to/file.test.ts`;
   types `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit`; lint changed files; full suite only
   before pushing (exclude `src/lib/flows.e2e.test.ts`, `.claude/**`). Paste real output in the PR.
6. **Never:** add another AI provider, weaken RLS/tenant isolation, change prices, add a phone number
   to marketing pages, invent business facts, claim a check passed that did not run, edit generated
   files, or add a second publish/deferral/reservation path.
7. **Pair review:** the bot that writes code does not approve it; another bot checks evidence first.
8. **Report honestly:** mark anything without evidence as `NOT VERIFIED`.
