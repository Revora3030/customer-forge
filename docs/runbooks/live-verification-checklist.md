# Live Verification Checklist

This checklist is intentionally operational. Passing code review does not mark these items verified.

## Supabase
- [ ] Apply the reviewed migration in a non-production environment.
- [ ] Run Security Advisor.
- [ ] Run Performance Advisor.
- [ ] Confirm the old authenticated provisioning RPC is not executable.
- [ ] Confirm the server-only provisioning path works.
- [ ] Confirm the three FK indexes exist.
- [ ] Confirm all seven RLS policies use init-plan-safe auth calls.
- [ ] Run two-user/two-organization adversarial tests.
- [ ] Verify signup/onboarding/workspace provisioning.

## Authentication
- [ ] Enable leaked-password protection in Supabase Auth settings.
- [ ] Test password reset and session expiration.
- [ ] Test revoked/expired share and preview tokens.

## Generated sites
- [ ] Render desktop and mobile.
- [ ] Traverse internal navigation.
- [ ] Submit a non-production lead/quote/contact flow.
- [ ] Check keyboard/focus and accessible names.
- [ ] Check console/network errors.
- [ ] Measure Core Web Vitals.

## Billing
- [ ] Use sandbox/test Stripe only for end-to-end validation.
- [ ] Verify webhook signature and idempotency.
- [ ] Verify entitlement transitions.
- [ ] Confirm sandbox cannot mutate live customer state.

## Operations
- [ ] Trigger a controlled non-production error.
- [ ] Confirm Sentry/error event arrives without secrets or customer content.
- [ ] Execute a non-production backup restore drill.
- [ ] Exercise application rollback.
- [ ] Record timestamps and artifacts for each result.

A checkbox remains unchecked until evidence is captured.
