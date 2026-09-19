# Revora Growth Systems

An AI growth platform for local service businesses. Each customer gets a workspace with a
published website, a CRM for leads and quotes, bookings, reviews, analytics and billing —
built and improved through a natural-language AI builder.

## Stack

| Layer     | Technology                                                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Framework | TanStack Start v1 (React 19, Vite 7, SSR on Cloudflare Workers)                                                               |
| Styling   | Tailwind CSS v4 (`src/styles.css`, CSS-first config)                                                                          |
| Backend   | Supabase (Postgres, Auth, Storage, RLS)                                                                                       |
| Payments  | Stripe (setup fee + monthly subscription, live/sandbox split)                                                                 |
| AI        | Revora's own deterministic builder engine (zero external inference cost; external providers gated off by `ZERO_AI_COST_MODE`) |

## Getting started

```sh
npm install
npm run dev        # http://localhost:8080
```

| Script              | Purpose             |
| ------------------- | ------------------- |
| `npm run dev`       | Local dev server    |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint`      | ESLint              |
| `npx vitest run`    | Test suite          |
| `npm run build`     | Production build    |

## Environment

Client variables are `VITE_`-prefixed and public. Everything else is server-only and read
inside a server function or route handler, never at module scope.

| Variable                        | Scope  | Purpose                          |
| ------------------------------- | ------ | -------------------------------- |
| `VITE_SUPABASE_URL`             | client | Supabase project URL             |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | client | Publishable (anon) key           |
| `SUPABASE_SERVICE_ROLE_KEY`     | server | Privileged server-only access    |
| `STRIPE_SECRET_KEY`             | server | Live Stripe API access           |
| `STRIPE_WEBHOOK_SECRET`         | server | Webhook signature verification   |
| `AI_DEFAULT_PROVIDER`           | server | First AI provider: google/openai |
| `AI_FALLBACK_PROVIDER`          | server | Provider used if the first fails |
| `GOOGLE_AI_API_KEY`             | server | Revora's Google AI account       |
| `OPENAI_API_KEY`                | server | Revora's OpenAI account          |
| `LOVABLE_API_KEY`               | server | Transactional email delivery     |

### Revora AI

All AI work — the builder, copy engine, image studio, voice notes, video chapters — runs through
Revora's own AI layer in `src/lib/ai/`:

```text
caller  ->  router.server.ts   choice of model class, limits, timeouts, retries,
            (the orchestrator)  provider fallback, circuit breaking, telemetry
        ->  providers/*.ts     one thin adapter per provider (Google, OpenAI)
        ->  the provider API   called directly with Revora's own key
```

Nothing outside `src/lib/ai/providers/` knows which provider served a request, and no other
module holds a provider key. Adding a provider means one new adapter file. With no key
configured every AI feature fails closed with a single clear message rather than degrading
silently, and each deterministic Revora fallback (the built-in site builder, the built-in
request reader) still completes the job.

Usage is recorded in `ai_usage_events` and every attempted tool call in `ai_tool_audit`.
Neither table stores prompts, generated content, keys or personal details.

## Architecture

```text
src/routes/                 file-based routes
  index.tsx, crm.*, ...     public marketing + SEO pages
  _authenticated/app.*      customer workspace
  _authenticated/admin.*    platform admin (super_admin only)
  s.$slug.tsx, p.$token.tsx tenant site preview + signed draft link
  api/public/*              webhooks and cron (auth bypassed — verify in handler)
src/lib/                    server functions, agent, billing, SEO, tenancy
src/components/             marketing, workspace, tenant-site rendering
supabase/                   configuration; migrations are applied through Lovable
```

App-internal server logic uses `createServerFn` (`*.functions.ts`); privileged helpers live in
`*.server.ts` and are never imported by client code. Raw HTTP endpoints — Stripe webhooks and
scheduled jobs — are file routes under `src/routes/api/public/`.

## Domains

- `revoragrowthsystems.com` — the only primary platform domain.
- `revoraweb.site` — traffic only. Apex and `www` redirect to the platform preserving path and
  query; nested subdomains return 404 and never resolve a tenant.
- Customer websites are served **only** on a verified customer-owned custom domain, or through
  the `/s/:slug` preview path. Unpublished work is private and reachable only via a signed
  `/p/:token` link.

Cloudflare Worker configuration lives in `cloudflare/`.

## The AI builder

The agent runs a staged pipeline in `src/lib/agent/`:

```text
UNDERSTAND → INSPECT → DESIGN → PLAN → REFLECT → CRITIQUE → AUTO-FIX → VERIFY → REPORT
```

| Stage             | Module                        |
| ----------------- | ----------------------------- |
| Understand        | `understanding.server.ts`     |
| Inspect           | `workspace-context.server.ts` |
| Design            | `design-brief.server.ts`      |
| Plan / reflect    | `orchestrator.server.ts`      |
| Critique/auto-fix | `critique.server.ts`          |
| Capabilities      | `capabilities.ts`             |

Owners describe changes in ordinary language; no Revora vocabulary is required and requests are
never rejected for being vague. The agent commits to a design direction, plans real content
edits, grades its own plan out of 10 across design, UX, branding, hierarchy, conversion, mobile,
accessibility, SEO, content and consistency, and improves the plan itself when it scores below
the professional threshold. Anything outside website content is reported as an honest handoff
rather than silently skipped.

Every plan is shown for approval before it is applied. Applied changes are validated against
real pages, sections, components, slugs and ownership, and are written under the owner's own
session so RLS enforces tenant isolation.

## Billing

- $750 one-time setup, first month of $100/month free, then $100/month.
- 3-day trials are recorded in `platform_trials`; accounts in `platform_accounts`.
- Live and sandbox Stripe are fully isolated: sandbox events are bookkept separately and can
  never change production entitlement, trials, access or revenue metrics.
- Payment identity is `organization_id` + provider + environment. Refunds use the environment
  stored on the payment.
- Webhooks are signature-verified and idempotent; database errors are thrown so Stripe retries.

## Security

- RLS on every tenant table; anonymous reads go through narrow public projections such as
  `public_business_profiles`, `public_reviews` and `public_website_settings`.
- `SECURITY DEFINER` functions pin `search_path`, validate identity with `auth.uid()`, and check
  tenant authorisation.
- Platform admin access requires a `super_admin` row in `user_roles`; role writes are guarded and
  client writes revoked.
- Public link URLs are constrained on write and sanitised again at render time.
- Domain verification probes reject unsafe schemes, credentials, non-standard ports, IP literals,
  internal DNS targets and redirects.

## Backups and restore

Nightly backups run through `api/public/jobs/backup`. Website restore is transactional: a
snapshot is captured before significant changes and `restore_website_state` puts the whole page,
section and component tree back in a single database transaction, or not at all.

## Deployment

Publish from Lovable. Migrations are additive — never rewrite a deployed migration; add a new
one and backfill safely. Before shipping, run typecheck, lint, tests and the production build.


## Production quality contract

Customer Forge treats security, reliability, builder quality, accessibility, SEO, and conversion as
release requirements rather than optional polish.

Run the complete local gate with:

```sh
npm run quality
```

This runs TypeScript checks, linting, the repository secret/environment audit, the complete test suite,
and the production build. CI also runs the security audit and CodeQL.

### Credential safety

Real environment files are intentionally excluded from Git. Use `.env.example` as the template and
inject production secrets through the deployment platform. If a credential was ever committed, rotate
or revoke it before deleting the file; repository deletion alone does not invalidate a copied secret.

### Release discipline

Every production change should pass the repository gates before merge. High-risk changes affecting
authentication, tenancy, billing, publishing, database schema, or customer data require targeted
tests and a documented rollback path. See `SECURITY.md` and `docs/PRODUCTION_READINESS.md`.
