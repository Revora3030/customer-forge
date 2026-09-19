# Activation measurement runbook

## Canonical funnel

Visitors -> accounts created -> trials started -> active trials -> paid customers.

## Measurement rules

- Define one canonical event for each lifecycle transition.
- Do not count both form completion and trial creation as separate account/trial transitions.
- Prefer server-authoritative lifecycle events for billing and trial state.
- Use stable identifiers to prevent duplicate event ingestion.
- Keep organization and user boundaries explicit.
- Never derive revenue or customer counts from client-side display counters.

## Verification

For a non-production account:

1. create an account;
2. start a trial;
3. reload/retry the same transition;
4. confirm the lifecycle count increments once;
5. convert or simulate the paid state using the supported test path;
6. confirm the paid-customer count increments once.

Repeat with a second organization to confirm tenant isolation.
