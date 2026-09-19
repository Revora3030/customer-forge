# Customer Forge Production Readiness

This is the release contract for Customer Forge. A feature is not production ready because it compiles;
its observable behavior, security boundary, recovery path, and customer journey must also be verified.

## Security
- No real environment files are committed.
- No privileged credentials appear in source, fixtures, generated output, or documentation.
- Browser variables are intentionally public; server secrets never use VITE_.
- Tenant reads and writes are protected by RLS and server authorization.
- Share, invitation, portal, and preview tokens are scoped and protected against replay and cross-tenant access.
- Security audit and CodeQL are green.

## Reliability
- Typecheck, lint, unit tests, E2E checks, and production build are green.
- Critical flow coverage includes signup, onboarding, workspace creation, builder, preview/publish,
  lead capture, billing, invites, and recovery.
- Failures are explicit and recoverable; no silent success is reported.
- Migrations are additive and have a rollback or backfill plan.
- A deploy can be rolled back without corrupting website state.

## Builder quality
- Draft, preview, and live states are distinct.
- AI plans are bounded, validated, deduplicated, and executed only through the authoritative agent boundary.
- Publish verification checks SEO, navigation, conversion, accessibility, security, and payload sanity.
- Runtime/browser-only claims are never fabricated.
- Website state can be restored after a bad revision.

## UX and accessibility
- The primary first action is obvious.
- Public and authenticated flows work at mobile, tablet, and desktop widths.
- Forms expose labels, errors, focus states, and keyboard operation.
- Reduced motion is respected.
- Public CTAs resolve to real outcomes.

## SEO and conversion
- Titles, descriptions, canonicals, structured data, internal links, and sitemap/robots behavior are valid.
- Scaled pages have unique useful content and avoid thin or duplicate programmatic SEO.
- Conversion events use stable IDs and cannot double count a funnel transition.
- Funnel stages remain measurable: visitors, accounts, trials, active trials, paid customers.

## Operations
- Deploys have a version or commit identifier.
- Errors, failed webhooks, and critical jobs are observable.
- Backups are verified and restoration is periodically exercised.
- Incidents have an owner, rollback path, and customer communication procedure.

## Verification boundary

Repository checks prove code-level contracts. They do not prove provider dashboards, production secrets,
backups, alerts, or live browser behavior are configured. Those require environment-level verification.
