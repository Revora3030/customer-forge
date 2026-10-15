# Jarvis diagnostic mission control

Base reviewed: e23bd407897572cc3856fdd7827f405d7e36647f on lovable-sync.
Status: implementation proposed for direct commit; repository tests, typecheck, lint, build and deployment remain unverified.

## Implemented scope
- Database-backed super_admin check before acquiring a service-role client.
- Explicit user-scoped history reads/deletes and latest-200 history selection.
- Checked user/assistant message persistence; freeOnly:true for Jarvis generation.
- Bounded seven-day error grouping, build/publish/image summaries, API column-contract probes.
- HTTP/SEO observations with 60,000-byte response limits; best-effort regex metadata parsing.
- Read-only diagnostic status cards, evidence inspection, quick prompts and typed speech controls.
- Redacted error excerpts and explicit untrusted-data instructions; redaction is not a guarantee of complete PII removal.

## Not implemented or certified
- Automatic SQL, code mutations, publishing, source-code access, streaming, or full migration parity.
- Live Sentry ingestion or Google indexing verification.
- Worker lease/checkpoint/image-fallback changes or Sol/Terra/Luna execution changes.
- Six-provider allowlisting, account-level billing verification, guaranteed zero cost or universal 10/10 quality.
- Email allowlisting beyond the existing database super_admin role.

## Before production sign-off
1. Run typecheck, lint, full tests and build against this branch.
2. Verify non-admin denial and user-scoped history isolation with two admins.
3. Verify the production Supabase target and monitoring table contracts.
4. Test database errors, provider quota exhaustion, message-write failure and malformed rows.
5. Review telemetry privacy before sending diagnostic excerpts to configured third-party AI providers.
6. Test no paid dispatch when freeOnly:true; verify provider-account limits separately.
7. Test mobile rendering, microphone denial, speech cancellation and unavailable states.
8. Add persistent rate limits, request idempotency and concurrency controls before high-volume usage.
9. Do not generate or apply corrective DDL from select-contract errors alone.
10. Worker liveness uses lease_expires_at and updated_at; do not repurpose started_at as a heartbeat.
