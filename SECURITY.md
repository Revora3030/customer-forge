# Security Policy

## Secret handling

Never commit .env, .env.development, .env.production, .env.test, .env.local, private keys,
Stripe secret keys, webhook signing secrets, Supabase service-role keys, or AI provider credentials.

Only .env.example belongs in source control. Browser-visible variables must be intentionally
publishable. Privileged credentials must remain server-side and be injected by the deployment platform.

If a credential has ever been committed, deleting the file is not sufficient. Rotate or revoke the
credential at its provider first, then remove the file and clean repository history through an approved
repository-maintenance process.

## Tenant isolation

All customer-owned records must be protected by Supabase RLS and server-side authorization. New tenant
tables require an explicit RLS policy and an adversarial test for organization A attempting to access
organization B.

Never authorize a request from a client-supplied organization ID alone. Resolve identity server-side
and verify membership and role before privileged work.

## Public and share links

Preview, portal, invitation, and share tokens must be opaque, sufficiently random, scoped to the intended
resource, expiring or revocable where appropriate, and safe against replay and cross-tenant disclosure.

## Production changes

Security-sensitive changes require green typecheck, lint, tests, build, CodeQL, and the repository
security audit before merge. Database, billing, authentication, and publishing changes require
rollback consideration and targeted tests.

## Reporting

Do not publish suspected secrets or exploit details in a public issue. Use a private security-reporting
channel available to repository maintainers.

## Response hardening

The platform applies baseline response protections including MIME sniffing prevention, strict referrer policy, clickjacking protection, cross-origin isolation controls, DNS-prefetch suppression, and HSTS on HTTPS responses. HTML responses additionally receive the explicit CSP and Permissions Policy defined in `src/lib/security-headers.ts`.
