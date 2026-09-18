# Revora Production Excellence Acceptance Criteria

This document is the release contract for turning Revora into a measurable, trustworthy, and operationally reliable growth platform. It complements, rather than replaces, existing tenant isolation, billing, builder, and rollback safeguards.

## Scope

A release is not production-excellent merely because it builds. It must be safe, observable, measurable, indexable, and understandable to a prospective local-business customer.

## Security

- Supabase leaked-password protection is enabled in the Auth dashboard.
- No service-role key, provider secret, webhook secret, private token, or real production credential is committed to Git history.
- Only `.env.example` is version controlled; local and production secrets are stored in the deployment secret manager.
- Every authenticated data operation is tenant-scoped by organization membership and tested against cross-tenant access.
- Workspace provisioning derives ownership only from `auth.uid()`, permits no anonymous execution, and never permits client-controlled trial duration, privilege elevation, billing status, or platform settings writes.
- Every SECURITY DEFINER function has a schema-qualified body, fixed search_path, least-privilege execute grants, and an explicit rationale.

## Search and content quality

- Every indexable marketing URL has one canonical URL, a declared self-canonical, indexable content, and one primary commercial intent.
- Singular/plural and legacy industry URLs redirect or canonicalize to one chosen route.
- The sitemap contains only canonical URLs intended for indexing.
- Programmatic location pages are indexable only when they contain materially unique, useful content and a clear conversion path; thin variants are noindexed and removed from the sitemap.
- Every priority page has unique title, description, Open Graph fields, internal links, and an audience-specific CTA.
- Search Console confirms successful mobile fetches, no canonical mismatch, and indexing progress for the homepage, pricing, get-started, industry hubs, and one commercial vertical page.

## Growth measurement

Required first-party events:

- `marketing_page_view`
- `growth_assessment_started`
- `growth_assessment_completed`
- `trial_started`
- `setup_checkout_started`
- `setup_payment_completed`
- `demo_requested`
- `booking_requested`

Every event must include a stable anonymous visitor ID or authenticated user ID when appropriate, session ID, landing path, referrer, UTM source, UTM medium, UTM campaign, event timestamp, and tenant context only when safe. Events must be idempotent and must never contain payment-card data, raw credentials, or unnecessary customer message content.

## Reliability and observability

- All server, webhook, automation, and job failures emit a structured error record with a request ID, subsystem, sanitized error code, severity, release, route or operation, retryability, and tenant-safe organization context.
- Sentry receives a verified production event and has a discoverable project with alerts for onboarding, payment, authentication, domain, and automation failures.
- Payment webhooks are signature verified, idempotent by provider event ID, and safely handle retry, duplicate, failed, refunded, disputed, canceled, and out-of-order events.
- Each automation run has queued, running, succeeded, failed, cancelled, and retried states where applicable, plus an operator-visible failure reason.
- A tenant backup and restore drill has been executed without cross-tenant data exposure.

## Conversion and trust

- The offer clearly distinguishes free workspace access from the paid implementation and launch process.
- Pricing, included services, first-month treatment, recurring charge, cancellation, ownership, support, and data/export expectations are visible before payment.
- The homepage contains a real product walkthrough and clearly labeled proof assets. Claims are evidence-backed and no demo metric is presented as customer performance.
- Each primary CTA preserves UTMs through assessment, signup, checkout, and confirmation.

## Release gate

Before merge, the pull request must include:

1. The exact output of `bun run typecheck`.
2. The exact output of the relevant test suite.
3. A statement of tenant-isolation impact and proof of no cross-tenant regression.
4. A migration plan and rollback plan for any schema change.
5. Manual verification steps for desktop and mobile marketing flows.
6. Search Console and analytics verification where an SEO or measurement change is included.
7. A production rollout and rollback owner.

## Current priority order

1. Enable compromised-password protection and complete local credential-history audit.
2. Verify GA4 collection and the production Sentry project/event path.
3. Consolidate programmatic SEO routes around canonical commercial industry hubs; noindex thin state pages until each has unique evidence.
4. Ship a proof-first conversion section and an explicit trial-versus-implementation explanation.
5. Add funnel-event, payment, onboarding, and automation reliability regression coverage.
6. Validate the first three to five real customer launches before scaling page inventory or paid acquisition.
